// Tests for the automation API endpoints:
//   GET  /api/automation
//   POST /api/accounts/:id/drop
//   DELETE /api/accounts/:id/drop
//   GET  /api/automation/next-drop
//   POST /api/automation/next-drop/switch

const request = require("supertest");
const os      = require("os");
const path    = require("path");
const fs      = require("fs");

// ── temp dir + env ────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-automation-"));
process.env.TEST_DB_PATH  = path.join(tmpDir, "accounts.json");
process.env.TEST_KEY_PATH = path.join(tmpDir, ".key");
process.env.DATA_DIR      = tmpDir;

// ── fake Steam directory (needed by next-drop/switch) ─────────────────────────
const steamDir = path.join(tmpDir, "Steam");
const steamExe = path.join(steamDir, "steam.exe");
fs.mkdirSync(path.join(steamDir, "config"), { recursive: true });
fs.writeFileSync(steamExe, "");

// ── mock child_process ────────────────────────────────────────────────────────
const mockExec = jest.fn((cmd, cb) => {
  if (!cb) return;
  if (cmd.includes("reg query") && cmd.includes("InstallPath"))
    cb(null, `    InstallPath    REG_SZ    ${steamDir}`);
  else
    cb(null, "INFO: No tasks are running which match the specified criteria.");
});
const mockExecFile = jest.fn((_f, _a, cb) => { if (cb) cb(null, "", ""); });
const mockSpawn    = jest.fn(() => ({ on: jest.fn(), unref: jest.fn() }));

jest.mock("child_process", () => ({
  exec:     (...a) => mockExec(...a),
  execFile: (...a) => mockExecFile(...a),
  spawn:    (...a) => mockSpawn(...a),
}));
jest.mock("https", () => ({ get: jest.fn() }));

// ── load app ──────────────────────────────────────────────────────────────────
const { app } = require("../index");

// ── teardown ──────────────────────────────────────────────────────────────────
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  fs.writeFileSync(process.env.TEST_DB_PATH, "[]");
  mockExec.mockClear();
  mockSpawn.mockClear();
  // Empty loginusers.vdf
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), '"users"\n{\n}\n');
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function createAccount(overrides = {}) {
  const res = await request(app)
    .post("/api/accounts")
    .send({ name: "testuser", ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

// Write an account directly to the DB (bypasses encryption, faster for eligibility tests)
function seedDB(accounts) {
  fs.writeFileSync(process.env.TEST_DB_PATH, JSON.stringify(accounts));
}

// Get the current CS2 week start (Wednesday 01:00 UTC) — mirrors server logic
function getCurrentWeekStart() {
  const now  = new Date();
  const day  = now.getUTCDay();
  const hour = now.getUTCHours();
  let daysBack;
  if      (day === 3 && hour >= 1) daysBack = 0;
  else if (day === 3)              daysBack = 7;
  else if (day > 3)                daysBack = day - 3;
  else                             daysBack = day + 4;
  const d = new Date(now);
  d.setUTCDate(now.getUTCDate() - daysBack);
  d.setUTCHours(1, 0, 0, 0);
  return d.toISOString();
}

function writeVdf(steamId64) {
  const vdf = `"users"\n{\n\t"${steamId64}"\n\t{\n\t\t"AccountName"\t\t"testuser"\n\t\t"MostRecent"\t\t"0"\n\t}\n}\n`;
  fs.writeFileSync(path.join(steamDir, "config", "loginusers.vdf"), vdf);
}

// A future timestamp well past the next weekly reset
const FAR_FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
// A timestamp already in the past
const PAST       = new Date(Date.now() - 60 * 1000).toISOString();

// ── GET /api/automation ───────────────────────────────────────────────────────

describe("GET /api/automation", () => {
  test("returns 200 with endpoint listing", async () => {
    const res = await request(app).get("/api/automation");
    expect(res.status).toBe(200);
    expect(res.body.endpoints).toBeDefined();
    expect(Array.isArray(res.body.endpoints)).toBe(true);
  });

  test("includes all key automation endpoints in the listing", async () => {
    const res   = await request(app).get("/api/automation");
    const paths = res.body.endpoints.map(e => e.url);
    expect(paths.some(p => p.includes("/api/accounts"))).toBe(true);
    expect(paths.some(p => p.includes("/api/automation/next-drop/switch"))).toBe(true);
    expect(paths.some(p => p.includes("/api/automation/next-drop"))).toBe(true);
    expect(paths.some(p => p.includes("/api/switch"))).toBe(true);
  });

  test("includes the current weekStart", async () => {
    const res = await request(app).get("/api/automation");
    expect(res.body.weekStart).toBeDefined();
    expect(() => new Date(res.body.weekStart)).not.toThrow();
  });
});

// ── POST /api/accounts/:id/drop ───────────────────────────────────────────────

describe("POST /api/accounts/:id/drop", () => {
  test("marks the current week's drop on a prime account", async () => {
    const acc = await createAccount({ prime: true });
    const res = await request(app).post(`/api/accounts/${acc.id}/drop`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.weekStart).toBeDefined();
    expect(res.body.account.weeklyDrops).toHaveLength(1);
    expect(res.body.account.weeklyDrops[0].weekStart).toBe(getCurrentWeekStart());
  });

  test("works on non-prime accounts too (marking is independent of eligibility)", async () => {
    const acc = await createAccount({ prime: false });
    const res = await request(app).post(`/api/accounts/${acc.id}/drop`);
    expect(res.status).toBe(200);
    expect(res.body.account.weeklyDrops).toHaveLength(1);
  });

  test("is idempotent — calling twice does not duplicate the drop entry", async () => {
    const acc = await createAccount({ prime: true });
    await request(app).post(`/api/accounts/${acc.id}/drop`);
    await request(app).post(`/api/accounts/${acc.id}/drop`);

    const list = await request(app).get("/api/accounts");
    const found = list.body.find(a => a.id === acc.id);
    expect(found.weeklyDrops).toHaveLength(1);
  });

  test("preserves drops from previous weeks", async () => {
    const pastWeek = "2025-01-01T01:00:00.000Z";
    const acc = await createAccount({ prime: true });
    // Seed a previous week's drop directly
    const db = JSON.parse(fs.readFileSync(process.env.TEST_DB_PATH, "utf8"));
    db[0].weeklyDrops = [{ weekStart: pastWeek }];
    fs.writeFileSync(process.env.TEST_DB_PATH, JSON.stringify(db));

    await request(app).post(`/api/accounts/${acc.id}/drop`);

    const list = await request(app).get("/api/accounts");
    expect(list.body[0].weeklyDrops).toHaveLength(2);
  });

  test("returns 404 for unknown account id", async () => {
    const res = await request(app).post("/api/accounts/no-such-id/drop");
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/accounts/:id/drop ─────────────────────────────────────────────

describe("DELETE /api/accounts/:id/drop", () => {
  test("removes the current week's drop mark", async () => {
    const acc = await createAccount({ prime: true });
    await request(app).post(`/api/accounts/${acc.id}/drop`);

    const del = await request(app).delete(`/api/accounts/${acc.id}/drop`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
    expect(del.body.account.weeklyDrops).toHaveLength(0);
  });

  test("only removes the current week — past weeks are preserved", async () => {
    const pastWeek = "2025-01-01T01:00:00.000Z";
    const acc = await createAccount({ prime: true });
    const db  = JSON.parse(fs.readFileSync(process.env.TEST_DB_PATH, "utf8"));
    db[0].weeklyDrops = [{ weekStart: pastWeek }, { weekStart: getCurrentWeekStart() }];
    fs.writeFileSync(process.env.TEST_DB_PATH, JSON.stringify(db));

    await request(app).delete(`/api/accounts/${acc.id}/drop`);

    const list = await request(app).get("/api/accounts");
    expect(list.body[0].weeklyDrops).toHaveLength(1);
    expect(list.body[0].weeklyDrops[0].weekStart).toBe(pastWeek);
  });

  test("is a no-op when no drop is marked for this week", async () => {
    const acc = await createAccount({ prime: true });
    const res = await request(app).delete(`/api/accounts/${acc.id}/drop`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("returns 404 for unknown account id", async () => {
    const res = await request(app).delete("/api/accounts/no-such-id/drop");
    expect(res.status).toBe(404);
  });
});

// ── GET /api/automation/next-drop ─────────────────────────────────────────────

describe("GET /api/automation/next-drop", () => {
  test("returns found:false when no accounts exist", async () => {
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
    expect(res.body.account).toBeNull();
    expect(res.body.remaining).toBe(0);
  });

  test("returns found:false when all accounts already have a drop this week", async () => {
    const weekStart = getCurrentWeekStart();
    seedDB([{ id: "a1", name: "alice", prime: true, weeklyDrops: [{ weekStart }] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(false);
  });

  test("returns the next eligible account", async () => {
    seedDB([{ id: "a1", name: "alice", prime: true, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(true);
    expect(res.body.account.name).toBe("alice");
    expect(res.body.remaining).toBe(1);
  });

  test("skips non-prime accounts", async () => {
    seedDB([{ id: "a1", name: "alice", prime: false, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(false);
  });

  test("skips VAC-banned accounts", async () => {
    seedDB([{ id: "a1", name: "alice", prime: true, vacBanned: true, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(false);
  });

  test("skips accounts with game bans", async () => {
    seedDB([{ id: "a1", name: "alice", prime: true, gameBans: 1, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(false);
  });

  test("skips accounts on cooldown that extends past the next weekly reset", async () => {
    seedDB([{ id: "a1", name: "alice", prime: true, expires: FAR_FUTURE, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(false);
  });

  test("does NOT skip accounts whose cooldown expires before the next reset", async () => {
    // Expires in 5 minutes — well before next weekly reset
    const soonExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    seedDB([{ id: "a1", name: "alice", prime: true, expires: soonExpiry, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(true);
  });

  test("does NOT skip accounts with an already-expired cooldown", async () => {
    seedDB([{ id: "a1", name: "alice", prime: true, expires: PAST, weeklyDrops: [] }]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(true);
  });

  test("skips already-done accounts and returns the next one", async () => {
    const weekStart = getCurrentWeekStart();
    seedDB([
      { id: "a1", name: "alice", prime: true, weeklyDrops: [{ weekStart }] },
      { id: "a2", name: "bob",   prime: true, weeklyDrops: [] },
    ]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.found).toBe(true);
    expect(res.body.account.name).toBe("bob");
    expect(res.body.remaining).toBe(1);
  });

  test("remaining reflects total eligible count, not just the first", async () => {
    seedDB([
      { id: "a1", name: "alice", prime: true, weeklyDrops: [] },
      { id: "a2", name: "bob",   prime: true, weeklyDrops: [] },
      { id: "a3", name: "carol", prime: true, weeklyDrops: [] },
    ]);
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.remaining).toBe(3);
  });

  test("includes weekStart in all responses", async () => {
    const res = await request(app).get("/api/automation/next-drop");
    expect(res.body.weekStart).toBe(getCurrentWeekStart());
  });
});

// ── POST /api/automation/next-drop/switch ─────────────────────────────────────

describe("POST /api/automation/next-drop/switch", () => {
  test("returns found:false with message when no eligible accounts", async () => {
    const res = await request(app).post("/api/automation/next-drop/switch");
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
    expect(res.body.message).toBeDefined();
  });

  test("returns found:false when all prime accounts have a drop this week", async () => {
    const weekStart = getCurrentWeekStart();
    seedDB([{ id: "a1", name: "alice", prime: true, weeklyDrops: [{ weekStart }] }]);
    const res = await request(app).post("/api/automation/next-drop/switch");
    expect(res.body.found).toBe(false);
  });

  test("switches to the next eligible account via loginusers.vdf (fast-path)", async () => {
    const steamId64 = "76561198000000001";
    writeVdf(steamId64);
    seedDB([{ id: "a1", name: "alice", prime: true, steamId64, weeklyDrops: [] }]);

    const res = await request(app).post("/api/automation/next-drop/switch");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.found).toBe(true);
    expect(res.body.account.name).toBe("alice");
  });

  test("includes remaining count in response", async () => {
    const steamId64 = "76561198000000002";
    writeVdf(steamId64);
    seedDB([
      { id: "a1", name: "alice", prime: true, steamId64, weeklyDrops: [] },
      { id: "a2", name: "bob",   prime: true, weeklyDrops: [] },
    ]);
    const res = await request(app).post("/api/automation/next-drop/switch");
    expect(res.body.remaining).toBe(1); // alice switched, bob still pending
  });

  test("does not mark the drop automatically — account still eligible after switch", async () => {
    const steamId64 = "76561198000000003";
    writeVdf(steamId64);
    seedDB([{ id: "a1", name: "alice", prime: true, steamId64, weeklyDrops: [] }]);

    await request(app).post("/api/automation/next-drop/switch");

    // Drop should NOT be auto-marked — caller is responsible for doing that
    const followUp = await request(app).get("/api/automation/next-drop");
    expect(followUp.body.found).toBe(true);
    expect(followUp.body.account.name).toBe("alice");
  });

  test("skips ineligible accounts and switches to the first eligible one", async () => {
    const steamId64 = "76561198000000004";
    const weekStart = getCurrentWeekStart();
    writeVdf(steamId64);
    seedDB([
      { id: "a1", name: "alice", prime: true, weeklyDrops: [{ weekStart }] }, // done
      { id: "a2", name: "bob",   prime: true, steamId64, weeklyDrops: [] },   // eligible
    ]);
    const res = await request(app).post("/api/automation/next-drop/switch");
    expect(res.body.found).toBe(true);
    expect(res.body.account.name).toBe("bob");
  });

  test("spawns the steam executable", async () => {
    const steamId64 = "76561198000000005";
    writeVdf(steamId64);
    seedDB([{ id: "a1", name: "alice", prime: true, steamId64, weeklyDrops: [] }]);

    await request(app).post("/api/automation/next-drop/switch");
    expect(mockSpawn).toHaveBeenCalled();
  });
});
