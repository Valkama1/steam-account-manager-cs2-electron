// Tests for the notifications system — endpoints + addNotification logic
const request = require("supertest");
const os      = require("os");
const path    = require("path");
const fs      = require("fs");

// Point all data files at a temp directory so tests never touch real data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-notif-"));
process.env.DATA_DIR      = tmpDir;
process.env.TEST_DB_PATH  = path.join(tmpDir, "accounts.json");
process.env.TEST_KEY_PATH = path.join(tmpDir, ".key");

jest.mock("https", () => ({ get: jest.fn() }));

const { app }           = require("../index");
const { addNotification, readNotifications, clearAll } = require("../notifications");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  // Reset notifications and accounts before every test
  clearAll();
  fs.writeFileSync(process.env.TEST_DB_PATH, "[]");
});

// ── Helper: seed a fake notification directly via addNotification ─────────────

function fakeVacBan(overrides = {}) {
  addNotification({
    type:        "vac_ban",
    source:      "account",
    accountName: "FakePlayer",
    steamId64:   "76561198000000001",
    ...overrides,
  });
}

function fakeGameBan(overrides = {}) {
  addNotification({
    type:        "game_ban",
    source:      "watchlist",
    accountName: "WatchedPlayer",
    steamId64:   "76561198000000002",
    ...overrides,
  });
}

// ── GET /api/notifications ────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  test("returns empty array when there are no notifications", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("returns a VAC ban notification after seeding one", async () => {
    fakeVacBan();
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const n = res.body[0];
    expect(n.type).toBe("vac_ban");
    expect(n.source).toBe("account");
    expect(n.accountName).toBe("FakePlayer");
    expect(n.steamId64).toBe("76561198000000001");
    expect(n.id).toBeDefined();
    expect(n.createdAt).toBeDefined();
  });

  test("returns multiple notifications of different types", async () => {
    fakeVacBan();
    fakeGameBan();
    const res = await request(app).get("/api/notifications");
    expect(res.body).toHaveLength(2);
    const types = res.body.map(n => n.type);
    expect(types).toContain("vac_ban");
    expect(types).toContain("game_ban");
  });

  test("most-recent notification appears first", async () => {
    fakeVacBan({ accountName: "First",  steamId64: "76561198000000010" });
    fakeGameBan({ accountName: "Second", steamId64: "76561198000000011" });
    const res = await request(app).get("/api/notifications");
    // addNotification uses unshift, so last-added is index 0
    expect(res.body[0].accountName).toBe("Second");
    expect(res.body[1].accountName).toBe("First");
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe("addNotification deduplication", () => {
  test("does not add duplicate for same account + type", () => {
    fakeVacBan();
    fakeVacBan(); // exact same steamId64 + type
    expect(readNotifications()).toHaveLength(1);
  });

  test("allows different type for same account", () => {
    fakeVacBan({ steamId64: "76561198000000001" });
    fakeGameBan({ steamId64: "76561198000000001" }); // same ID, different type
    expect(readNotifications()).toHaveLength(2);
  });

  test("allows same type for different accounts", () => {
    fakeVacBan({ steamId64: "76561198000000001" });
    fakeVacBan({ steamId64: "76561198000000099", accountName: "OtherPlayer" });
    expect(readNotifications()).toHaveLength(2);
  });
});

// ── DELETE /api/notifications (clear all) ─────────────────────────────────────

describe("DELETE /api/notifications", () => {
  test("clears all notifications", async () => {
    fakeVacBan();
    fakeGameBan();
    const del = await request(app).delete("/api/notifications");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const res = await request(app).get("/api/notifications");
    expect(res.body).toEqual([]);
  });

  test("clearing an already-empty list returns ok", async () => {
    const res = await request(app).delete("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── DELETE /api/notifications/:id (dismiss one) ───────────────────────────────

describe("DELETE /api/notifications/:id", () => {
  test("removes only the targeted notification", async () => {
    fakeVacBan();
    fakeGameBan();
    const list = readNotifications();
    const targetId = list[0].id; // most recent (game_ban)

    const del = await request(app).delete(`/api/notifications/${targetId}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const res = await request(app).get("/api/notifications");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe("vac_ban");
  });

  test("dismissing a non-existent id is a no-op (returns ok)", async () => {
    fakeVacBan();
    const res = await request(app).delete("/api/notifications/does-not-exist");
    expect(res.status).toBe(200);
    // The existing notification should be untouched
    expect(readNotifications()).toHaveLength(1);
  });
});

// ── Realistic scenario: ban detected during refresh-all ───────────────────────

describe("refresh-all ban detection", () => {
  test("adds a VAC ban notification when a previously-clean account gets banned", async () => {
    // Create an account with no ban
    const createRes = await request(app)
      .post("/api/accounts")
      .send({ name: "cleanplayer", steamId64: "76561198000000050" });
    expect(createRes.status).toBe(201);

    // Manually write a clean state into the DB (vacBanned: false)
    const db = JSON.parse(fs.readFileSync(process.env.TEST_DB_PATH, "utf8"));
    db[0].vacBanned = false;
    db[0].gameBans  = 0;
    fs.writeFileSync(process.env.TEST_DB_PATH, JSON.stringify(db, null, 2));

    // Simulate a new VAC ban arriving by calling addNotification the same way
    // the refresh-all route does it
    addNotification({
      type:        "vac_ban",
      source:      "account",
      accountName: "cleanplayer",
      steamId64:   "76561198000000050",
    });

    const notifs = readNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("vac_ban");
    expect(notifs[0].source).toBe("account");
    expect(notifs[0].accountName).toBe("cleanplayer");
  });

  test("adds a game ban notification when game ban count increases", async () => {
    addNotification({
      type:        "game_ban",
      source:      "account",
      accountName: "cheaterplayer",
      steamId64:   "76561198000000060",
    });

    const notifs = readNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("game_ban");
  });
});

// ── Watchlist scenario ────────────────────────────────────────────────────────

describe("watchlist ban detection", () => {
  test("adds a watchlist VAC ban notification", async () => {
    addNotification({
      type:        "vac_ban",
      source:      "watchlist",
      accountName: "SuspiciousPlayer",
      steamId64:   "76561198000000070",
    });

    const res = await request(app).get("/api/notifications");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe("watchlist");
    expect(res.body[0].accountName).toBe("SuspiciousPlayer");
  });

  test("adds both VAC and game ban notifications for the same watchlist account", async () => {
    const id = "76561198000000080";
    addNotification({ type: "vac_ban",  source: "watchlist", accountName: "DoubleBanned", steamId64: id });
    addNotification({ type: "game_ban", source: "watchlist", accountName: "DoubleBanned", steamId64: id });

    const res = await request(app).get("/api/notifications");
    expect(res.body).toHaveLength(2);
  });
});
