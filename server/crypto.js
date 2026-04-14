const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

const DATA_DIR  = process.env.DATA_DIR || __dirname;
const KEY_PATH  = process.env.TEST_KEY_PATH || path.join(DATA_DIR, ".key");
const ENC_PREFIX = "enc:";

function loadOrCreateKey() {
  if (fs.existsSync(KEY_PATH)) {
    return Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "hex");
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key.toString("hex"), { mode: 0o600 });
  console.log("[crypto] generated new encryption key at", KEY_PATH);
  return key;
}

const ENCRYPTION_KEY = loadOrCreateKey();

function encryptPassword(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptPassword(stored) {
  if (!stored) return null;
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const parts = stored.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) return stored;
  const [ivHex, authTagHex, encHex] = parts;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
  } catch (e) {
    console.error("[crypto] decryption failed:", e.message);
    return null;
  }
}

function generateSteamGuardCode(sharedSecret) {
  const key     = Buffer.from(sharedSecret, "base64");
  const time    = Math.floor(Date.now() / 1000 / 30);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  timeBuf.writeUInt32BE(time >>> 0, 4);
  const hash     = crypto.createHmac("sha1", key).update(timeBuf).digest();
  const offset   = hash[19] & 0x0f;
  const fullCode = ((hash[offset]     & 0x7f) << 24) |
                   ((hash[offset + 1] & 0xff) << 16) |
                   ((hash[offset + 2] & 0xff) << 8)  |
                    (hash[offset + 3] & 0xff);
  const alphabet = "23456789BCDFGHJKMNPQRTVWXY";
  let code = "", n = fullCode;
  for (let i = 0; i < 5; i++) { code = alphabet[n % 26] + code; n = Math.floor(n / 26); }
  return code;
}

module.exports = { encryptPassword, decryptPassword, generateSteamGuardCode, ENC_PREFIX, ENCRYPTION_KEY };
