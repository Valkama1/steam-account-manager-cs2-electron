// Tests for password encryption / decryption
const os   = require("os");
const path = require("path");
const fs   = require("fs");

// Point to temp files BEFORE requiring the app so module-level init uses them
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-crypto-"));
process.env.TEST_DB_PATH  = path.join(tmpDir, "accounts.json");
process.env.TEST_KEY_PATH = path.join(tmpDir, ".key");

const { encryptPassword, decryptPassword } = require("../index");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("encryptPassword / decryptPassword", () => {
  test("round-trip returns original plaintext", () => {
    const plain = "hunter2";
    expect(decryptPassword(encryptPassword(plain))).toBe(plain);
  });

  test("each call produces a different ciphertext (unique IV)", () => {
    const a = encryptPassword("same");
    const b = encryptPassword("same");
    expect(a).not.toBe(b);
  });

  test("decrypting null returns null", () => {
    expect(decryptPassword(null)).toBeNull();
  });

  test("encrypting null / empty returns null", () => {
    expect(encryptPassword(null)).toBeNull();
    expect(encryptPassword("")).toBeNull();
  });

  test("ciphertext starts with 'enc:' prefix", () => {
    expect(encryptPassword("abc")).toMatch(/^enc:/);
  });

  test("passing plain text through decryptPassword returns it unchanged", () => {
    // Legacy plain-text passwords (no enc: prefix) must be returned as-is
    expect(decryptPassword("plain-password")).toBe("plain-password");
  });
});
