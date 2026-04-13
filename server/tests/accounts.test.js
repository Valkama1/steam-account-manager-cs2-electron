// Tests for account CRUD API endpoints
const request = require("supertest");
const os      = require("os");
const path    = require("path");
const fs      = require("fs");

// Temp files before requiring the app
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-accounts-"));
process.env.TEST_DB_PATH  = path.join(tmpDir, "accounts.json");
process.env.TEST_KEY_PATH = path.join(tmpDir, ".key");

// Mock Steam API / HTTP calls so tests run offline
jest.mock("https", () => ({ get: jest.fn() }));

const { app } = require("../index");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  // Reset DB before each test
  fs.writeFileSync(process.env.TEST_DB_PATH, "[]");
});

async function createAccount(overrides = {}) {
  const res = await request(app)
    .post("/api/accounts")
    .send({ name: "testuser", ...overrides });
  return res;
}

describe("GET /api/accounts", () => {
  test("returns empty array initially", async () => {
    const res = await request(app).get("/api/accounts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("returns accounts after creation", async () => {
    await createAccount({ name: "alice" });
    await createAccount({ name: "bob" });
    const res = await request(app).get("/api/accounts");
    expect(res.body).toHaveLength(2);
    expect(res.body.map(a => a.name)).toEqual(expect.arrayContaining(["alice", "bob"]));
  });

  test("never exposes the password field", async () => {
    await createAccount({ name: "alice", password: "secret" });
    const res = await request(app).get("/api/accounts");
    expect(res.body[0].password).toBeUndefined();
    expect(res.body[0].hasPassword).toBe(true);
  });
});

describe("POST /api/accounts", () => {
  test("creates account with required name", async () => {
    const res = await createAccount({ name: "alice" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("alice");
    expect(res.body.id).toBeDefined();
  });

  test("returns 400 when name is missing", async () => {
    const res = await request(app).post("/api/accounts").send({});
    expect(res.status).toBe(400);
  });

  test("stores password as encrypted (hasPassword=true)", async () => {
    const res = await createAccount({ name: "alice", password: "hunter2" });
    expect(res.body.hasPassword).toBe(true);
    expect(res.body.password).toBeUndefined();

    // Verify the raw DB entry is encrypted, not plaintext
    const db = JSON.parse(fs.readFileSync(process.env.TEST_DB_PATH, "utf8"));
    expect(db[0].password).toMatch(/^enc:/);
    expect(db[0].password).not.toContain("hunter2");
  });

  test("stores optional fields", async () => {
    const res = await createAccount({ name: "alice", alias: "Gangster", prime: true });
    expect(res.body.alias).toBe("Gangster");
    expect(res.body.prime).toBe(true);
  });
});

describe("PATCH /api/accounts/:id", () => {
  test("updates name and alias", async () => {
    const created = (await createAccount({ name: "alice" })).body;
    const res = await request(app)
      .patch(`/api/accounts/${created.id}`)
      .send({ alias: "Wonderland" });
    expect(res.status).toBe(200);
    expect(res.body.alias).toBe("Wonderland");
    expect(res.body.name).toBe("alice");
  });

  test("returns 404 for unknown id", async () => {
    const res = await request(app)
      .patch("/api/accounts/no-such-id")
      .send({ alias: "X" });
    expect(res.status).toBe(404);
  });

  test("updating password stores it encrypted", async () => {
    const created = (await createAccount({ name: "alice" })).body;
    await request(app)
      .patch(`/api/accounts/${created.id}`)
      .send({ password: "newpassword" });

    const db = JSON.parse(fs.readFileSync(process.env.TEST_DB_PATH, "utf8"));
    expect(db[0].password).toMatch(/^enc:/);
  });

  test("setting password to empty clears it", async () => {
    const created = (await createAccount({ name: "alice", password: "old" })).body;
    const res = await request(app)
      .patch(`/api/accounts/${created.id}`)
      .send({ password: "" });
    expect(res.body.hasPassword).toBe(false);
  });
});

describe("DELETE /api/accounts/:id", () => {
  test("removes the account", async () => {
    const created = (await createAccount({ name: "alice" })).body;
    const del = await request(app).delete(`/api/accounts/${created.id}`);
    expect(del.status).toBe(200);

    const list = await request(app).get("/api/accounts");
    expect(list.body).toHaveLength(0);
  });

  test("returns 404 for unknown id", async () => {
    const res = await request(app).delete("/api/accounts/no-such-id");
    expect(res.status).toBe(404);
  });
});
