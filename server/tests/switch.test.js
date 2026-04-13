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

// ── fake Steam directory ──────────────────────────────────────────────────────
const steamDir = path.join(tmpDir, "Steam");
const steamExe = path.join(steamDir, "steam.exe");
fs.mkdirSync(path.join(steamDir, "config"), { recursive: true });
fs.writeFileSync(steamExe, ""); // fake exe so fs.existsSync passes

// ── mock child_process BEFORE requiring the app ───────────────────────────────
// exec tracks every call; spawn returns a minimal stub.
const execCalls = [];
const mockExec = jest.fn((cmd, cb) => {
  execCalls.push(cmd);
  if (!cb) return; // some exec calls (e.g. steam.exe -shutdown) have no callback
  // Simulate reg query returning our fake Steam path
  if (cmd.includes("reg query") && cmd.includes("InstallPath")) {
    cb(null, `    InstallPath    REG_SZ    ${steamDir}`);
  } else {
    // tasklist: report no steam processes (Steam is "already closed")
    cb(null, "INFO: No tasks are running which match the specified criteria.");
  }
});

const mockSpawn = jest.fn(() => ({
  stdin: { write: jest.fn(), end: jest.fn() },
  unref: jest.fn(),
}));

jest.mock("child_process", () => ({
  exec: (...args) => mockExec(...args),
  spawn: (...args) => mockSpawn(...args),
}));
jest.mock("https", () => ({ get: jest.fn() }));

// ── load app ──────────────────────────────────────────────────────────────────
const { app, encryptPassword } = require("../index");

// ── helpers ───────────────────────────────────────────────────────────────────
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  fs.writeFileSync(process.env.TEST_DB_PATH, "[]");
  execCalls.length = 0;
  mockExec.mockClear();
  mockSpawn.mockClear();
  // Reset loginusers.vdf to empty (no accounts)
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), '"users"\n{\n}\n');
});

const TARGET_ID = "76561198000000001";

function writeVdf(steamId64) {
  // Write a vdf that contains the given steamId64
  const vdf = `"users"\n{\n\t"${steamId64}"\n\t{\n\t\t"AccountName"\t\t"testuser"\n\t\t"RememberPassword"\t\t"0"\n\t\t"MostRecent"\t\t"0"\n\t\t"AllowAutoLogin"\t\t"0"\n\t}\n}\n`;
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), vdf);
}

async function seedAccount(overrides = {}) {
  const base = { name: "testuser", id: require("crypto").randomUUID() };
  const acc = { ...base, ...overrides };
  fs.writeFileSync(process.env.TEST_DB_PATH, JSON.stringify([acc]));
  return acc;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("pre-check: return error without touching Steam", () => {
  test("404 for unknown account id", async () => {
    const res = await request(app).post("/api/switch/no-such-id");
    expect(res.status).toBe(404);
    expect(mockExec).not.toHaveBeenCalledWith(
      expect.stringContaining("tasklist"), expect.any(Function)
    );
  });

  test("400 when account has neither steamId64 nor password", async () => {
    const acc = await seedAccount({ name: "bare" }); // no steamId64, no password
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(400);
    // killSteam uses tasklist — it must NOT have been called
    expect(execCalls.some(c => c.includes("tasklist"))).toBe(false);
  });

  test("400 when steamId64 is present but not in loginusers.vdf, and no password", async () => {
    // The vdf is empty (written in beforeEach) — steamId64 won't be found
    const acc = await seedAccount({ steamId64: TARGET_ID }); // no password
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/loginusers\.vdf/i);
    // Steam must NOT have been killed
    expect(execCalls.some(c => c.includes("tasklist"))).toBe(false);
  });
});

describe("fast-path: steamId64 in loginusers.vdf, no password", () => {
  test("returns 200 and sets AutoLoginUser in registry", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });

    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Should have set AutoLoginUser registry key with the account username
    const regSet = execCalls.find(c => c.includes("AutoLoginUser") && c.includes(acc.name.toLowerCase()));
    expect(regSet).toBeDefined();
  });

  test("sets RememberPassword=1 in registry", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    await request(app).post(`/api/switch/${acc.id}`);

    const regCmd = execCalls.find(c => c.includes("RememberPassword") && c.includes("/d 1"));
    expect(regCmd).toBeDefined();
  });

  test("spawns steam.exe", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID });
    await request(app).post(`/api/switch/${acc.id}`);

    expect(mockSpawn).toHaveBeenCalledWith(
      steamExe, [], expect.objectContaining({ detached: true })
    );
  });

  test("does NOT start any login helper when no password stored", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({ steamId64: TARGET_ID }); // no password
    await request(app).post(`/api/switch/${acc.id}`);

    // Neither PowerShell nor C# exe should be spawned
    const helperCall = mockSpawn.mock.calls.find(
      c => c[0] === "powershell" || (typeof c[0] === "string" && c[0].includes("SteamLogin.exe"))
    );
    expect(helperCall).toBeUndefined();
  });
});

describe("C# path: password stored (SAM or fast-path with expiry)", () => {
  test("returns 200", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    const res = await request(app).post(`/api/switch/${acc.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("spawns SteamLogin.exe with the account username", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    await request(app).post(`/api/switch/${acc.id}`);

    const csCall = mockSpawn.mock.calls.find(
      c => typeof c[0] === "string" && c[0].includes("SteamLogin.exe")
    );
    expect(csCall).toBeDefined();
    expect(csCall[1]).toContain(acc.name.toLowerCase());
  });

  test("passes sharedSecret as second arg when present", async () => {
    const acc = await seedAccount({
      password: encryptPassword("secret"),
      sharedSecret: "abc123==",
    });
    await request(app).post(`/api/switch/${acc.id}`);

    const csCall = mockSpawn.mock.calls.find(
      c => typeof c[0] === "string" && c[0].includes("SteamLogin.exe")
    );
    expect(csCall).toBeDefined();
    expect(csCall[1]).toContain("abc123==");
  });

  test("does NOT spawn steam.exe or powershell directly (C# handles launch)", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    await request(app).post(`/api/switch/${acc.id}`);

    const steamSpawn = mockSpawn.mock.calls.find(c => c[0] === steamExe);
    const psSpawn    = mockSpawn.mock.calls.find(c => c[0] === "powershell");
    expect(steamSpawn).toBeUndefined();
    expect(psSpawn).toBeUndefined();
  });

  test("does NOT set registry directly (C# handles that internally)", async () => {
    const acc = await seedAccount({ password: encryptPassword("secret") });
    await request(app).post(`/api/switch/${acc.id}`);

    expect(execCalls.some(c => c.includes("AutoLoginUser"))).toBe(false);
    expect(execCalls.some(c => c.includes("RememberPassword"))).toBe(false);
  });

  test("also works when steamId64 is present (in VDF or not — C# handles both)", async () => {
    writeVdf(TARGET_ID);
    const acc = await seedAccount({
      steamId64: TARGET_ID,
      password: encryptPassword("hunter2"),
    });
    await request(app).post(`/api/switch/${acc.id}`);

    const csCall = mockSpawn.mock.calls.find(
      c => typeof c[0] === "string" && c[0].includes("SteamLogin.exe")
    );
    expect(csCall).toBeDefined();
  });
});
