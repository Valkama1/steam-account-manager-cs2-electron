// Tests for the /api/switch/:id route
// Key invariant: Steam must NEVER be killed unless we are sure we can relaunch it.
const request = require("supertest");
const os      = require("os");
const path    = require("path");
const fs      = require("fs");

// ── temp files ────────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-switch-"));
process.env.TEST_DB_PATH  = path.join(tmpDir, "accounts.json");
process.env.TEST_KEY_PATH = path.join(tmpDir, ".key");
process.env.DATA_DIR      = tmpDir;

// ── fake Steam directory ──────────────────────────────────────────────────────
const steamDir = path.join(tmpDir, "Steam");
const steamExe = path.join(steamDir, "steam.exe");
fs.mkdirSync(path.join(steamDir, "config"), { recursive: true });
fs.writeFileSync(steamExe, ""); // fake exe so fs.existsSync passes

// ── mock child_process BEFORE requiring the app ───────────────────────────────
const execCalls     = [];
const execFileCalls = [];

const mockExec = jest.fn((cmd, cb) => {
  execCalls.push(cmd);
  if (!cb) return;
  if (cmd.includes("reg query") && cmd.includes("InstallPath")) {
    cb(null, `    InstallPath    REG_SZ    ${steamDir}`);
  } else {
    // tasklist: report no steam processes (Steam is already closed)
    cb(null, "INFO: No tasks are running which match the specified criteria.");
  }
});

// execFile is used for registry writes in the fast-path
const mockExecFile = jest.fn((file, args, cb) => {
  execFileCalls.push({ file, args });
  if (cb) cb(null, "", "");
});

// spawn is used to launch steam.exe (and powershell.exe for 2FA)
const mockSpawn = jest.fn(() => ({
  on:    jest.fn(),
  unref: jest.fn(),
}));

jest.mock("child_process", () => ({
  exec:     (...args) => mockExec(...args),
  execFile: (...args) => mockExecFile(...args),
  spawn:    (...args) => mockSpawn(...args),
}));
jest.mock("https", () => ({ get: jest.fn() }));

// ── load app ──────────────────────────────────────────────────────────────────
const { app, encryptPassword } = require("../index");

// ── helpers ───────────────────────────────────────────────────────────────────
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  fs.writeFileSync(process.env.TEST_DB_PATH, "[]");
  execCalls.length     = 0;
  execFileCalls.length = 0;
  mockExec.mockClear();
  mockExecFile.mockClear();
  mockSpawn.mockClear();
  // Reset loginusers.vdf to empty (no accounts)
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), '"users"\n{\n}\n');
});

const TARGET_ID = "76561198000000001";

function writeVdf(steamId64) {
  const vdf = `"users"\n{\n\t"${steamId64}"\n\t{\n\t\t"AccountName"\t\t"testuser"\n\t\t"RememberPassword"\t\t"0"\n\t\t"MostRecent"\t\t"0"\n\t\t"AllowAutoLogin"\t\t"0"\n\t}\n}\n`;
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), vdf);
}

async function seedAccount(overrides = {}) {
  const base = { name: "testuser", id: require("crypto").randomUUID() };
  const acc  = { ...base, ...overrides };
  fs.writeFileSync(process.env.TEST_DB_PATH, JSON.stringify([acc]));
  return acc;
}

// ── pre-checks: fail before touching Steam ────────────────────────────────────

describe("pre-check: return error without touching Steam", () => {
  test("404 for unknown account id", async () => {
    const res = await request(app).post("/api/switch/no-such-id");
    expect(res.status).toBe(404);
    expect(execCalls.some(c => c.includes("tasklist"))).toBe(false);
  });

  test("400 when account has neither steamId64 nor password", async () => {
    const acc = await seedAccount({ name: "bare" });
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(400);
    expect(execCalls.some(c => c.includes("tasklist"))).toBe(false);
  });

  test("400 when steamId64 is present but not in loginusers.vdf and no password", async () => {
    const acc = await seedAccount({ steamId64: TARGET_ID });
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/loginusers\.vdf/i);
    expect(execCalls.some(c => c.includes("tasklist"))).toBe(false);
  });
});

// ── fast-path: steamId64 in loginusers.vdf ────────────────────────────────────

describe("fast-path: steamId64 in loginusers.vdf, no password", () => {
  test("returns 200", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("sets AutoLoginUser in registry via execFile", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    await request(app).post(`/api/switch/${acc.id}`);

    const call = execFileCalls.find(c =>
      c.file === "reg" && c.args.includes("AutoLoginUser") && c.args.includes(acc.name.toLowerCase())
    );
    expect(call).toBeDefined();
  });

  test("sets RememberPassword=1 in registry via execFile", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    await request(app).post(`/api/switch/${acc.id}`);

    const call = execFileCalls.find(c =>
      c.file === "reg" && c.args.includes("RememberPassword") && c.args.includes("1")
    );
    expect(call).toBeDefined();
  });

  test("spawns steam.exe with no login args", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    await request(app).post(`/api/switch/${acc.id}`);

    expect(mockSpawn).toHaveBeenCalledWith(
      steamExe, [], expect.objectContaining({ detached: true })
    );
  });

  test("does NOT spawn powershell when no sharedSecret", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    await request(app).post(`/api/switch/${acc.id}`);

    const psCall = mockSpawn.mock.calls.find(c => c[0] === "powershell.exe");
    expect(psCall).toBeUndefined();
  });
});

describe("fast-path: steamId64 in loginusers.vdf, with password", () => {
  test("spawns steam.exe with -login args", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({
      steamId64: TARGET_ID,
      password:  encryptPassword("hunter2"),
    });
    await request(app).post(`/api/switch/${acc.id}`);

    expect(mockSpawn).toHaveBeenCalledWith(
      steamExe,
      ["-login", acc.name.toLowerCase(), "hunter2"],
      expect.objectContaining({ detached: true })
    );
  });

  test("does NOT spawn powershell even when sharedSecret is set (2FA handled manually)", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({
      steamId64:    TARGET_ID,
      password:     encryptPassword("hunter2"),
      sharedSecret: "AABBCCDDEE==",
    });
    await request(app).post(`/api/switch/${acc.id}`);

    const psCall = mockSpawn.mock.calls.find(c => c[0] === "powershell.exe");
    expect(psCall).toBeUndefined();
  });
});

// ── password-path: not in loginusers.vdf, password stored ────────────────────

describe("password-path: account not in loginusers.vdf, password stored", () => {
  test("returns 200", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("spawns steam.exe with -login username password", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    await request(app).post(`/api/switch/${acc.id}`);

    expect(mockSpawn).toHaveBeenCalledWith(
      steamExe,
      ["-login", acc.name.toLowerCase(), "secret"],
      expect.objectContaining({ detached: true })
    );
  });

  test("does NOT set registry directly (no VDF entry, registry not needed)", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    await request(app).post(`/api/switch/${acc.id}`);

    expect(execFileCalls.some(c => c.args?.includes("AutoLoginUser"))).toBe(false);
    expect(execFileCalls.some(c => c.args?.includes("RememberPassword"))).toBe(false);
  });

  test("does NOT spawn powershell even when sharedSecret is set (2FA handled manually)", async () => {
    const acc = await seedAccount({
      password:     encryptPassword("secret"),
      sharedSecret: "AABBCCDDEE==",
    });
    await request(app).post(`/api/switch/${acc.id}`);

    const psCall = mockSpawn.mock.calls.find(c => c[0] === "powershell.exe");
    expect(psCall).toBeUndefined();
  });

  test("does NOT spawn powershell when no sharedSecret", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    await request(app).post(`/api/switch/${acc.id}`);

    const psCall = mockSpawn.mock.calls.find(c => c[0] === "powershell.exe");
    expect(psCall).toBeUndefined();
  });
});
