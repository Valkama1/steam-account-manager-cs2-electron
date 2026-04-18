/**
 * Vault authentication module — Bitwarden-style security
 *
 * Architecture:
 *   - Master password is NEVER stored. A PBKDF2 key derived from it is used to
 *     AES-256-GCM encrypt the vault key. Only the encrypted blob is persisted.
 *   - Recovery key (32 random bytes as hex) derives a second wrapping key that
 *     also encrypts the vault key independently.
 *   - The vault key (same 32-byte key as the old `.key` file) encrypts all
 *     account passwords in accounts.json.
 *   - TOTP (RFC 6238) is optionally stored as an AES-encrypted secret inside
 *     auth.json — encrypted with the vault key, so it can only be read when
 *     the vault is already open.
 *   - Legacy mode: if auth.json does not exist but `.key` does, the vault
 *     auto-unlocks from `.key` so existing installs keep working without changes.
 */

"use strict";

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

const DATA_DIR  = process.env.DATA_DIR || __dirname;
const KEY_PATH  = process.env.TEST_KEY_PATH  || path.join(DATA_DIR, ".key");
const AUTH_PATH = process.env.TEST_AUTH_PATH || path.join(DATA_DIR, "auth.json");

// Allow fast iterations in tests
const PBKDF2_ITERATIONS = parseInt(process.env.PBKDF2_ITERATIONS || "600000", 10);
const PBKDF2_DIGEST     = "sha256";
const KEY_LEN           = 32; // bytes → AES-256
const SALT_LEN          = 32;

// ── In-memory vault key ────────────────────────────────────────────────────────

let _vaultKey = null; // Buffer(32) when unlocked, null when locked

function isUnlocked() { return _vaultKey !== null; }
function lock() { _vaultKey = null; }
function getVaultKey() { return _vaultKey; }

// ── Low-level AES-256-GCM helpers ─────────────────────────────────────────────

function aesgcmEncrypt(key, plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return { iv: iv.toString("hex"), tag: tag.toString("hex"), data: enc.toString("hex") };
}

function aesgcmDecrypt(key, blob) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm", key, Buffer.from(blob.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.data, "hex")),
    decipher.final(),
  ]);
}

// ── PBKDF2 key derivation ─────────────────────────────────────────────────────

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, PBKDF2_DIGEST);
}

// ── auth.json persistence ─────────────────────────────────────────────────────

function readAuth() {
  if (!fs.existsSync(AUTH_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(AUTH_PATH, "utf8")); } catch { return null; }
}

function writeAuth(data) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ── Recovery key (32 random bytes displayed as uppercase hex) ─────────────────

function generateRecoveryKey() {
  return crypto.randomBytes(32).toString("hex").toUpperCase();
}

// Normalise: strip spaces/dashes the user might type
function normaliseRecoveryKey(raw) {
  return raw.replace(/[\s\-]/g, "").toUpperCase();
}

// ── TOTP (RFC 6238, SHA-1, 30s, 6 digits) ────────────────────────────────────

// Base32 decode — standard RFC 4648 alphabet
const B32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(str) {
  str = str.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0;
  const output = [];
  for (const c of str) {
    const idx = B32_CHARS.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function base32Encode(buf) {
  let bits = 0, value = 0, output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 0x1f];
  return output;
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160-bit secret
}

function totpCode(secret, timeStep) {
  const key     = base32Decode(secret);
  const counter = timeStep ?? Math.floor(Date.now() / 1000 / 30);
  const buf     = Buffer.alloc(8);
  // write 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac  = crypto.createHmac("sha1", key).update(buf).digest();
  const off   = hmac[hmac.length - 1] & 0x0f;
  const code  = ((hmac[off] & 0x7f) << 24 |
                 (hmac[off+1] & 0xff) << 16 |
                 (hmac[off+2] & 0xff) << 8  |
                 (hmac[off+3] & 0xff)) % 1_000_000;
  return String(code).padStart(6, "0");
}

/**
 * Verify a 6-digit TOTP code with ±1 window (±30s clock drift).
 */
function verifyTotp(secret, userCode) {
  const t = Math.floor(Date.now() / 1000 / 30);
  return [-1, 0, 1].some(delta => totpCode(secret, t + delta) === userCode);
}

/**
 * Build the otpauth URI for QR code display.
 */
function totpUri(secret, label = "Steam Manager", issuer = "Steam Manager") {
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * status() → { hasAuth, legacyMode, locked, totpEnabled }
 *
 * hasAuth     — auth.json exists (user has set up a master password)
 * legacyMode  — no auth.json but .key exists → vault auto-unlocked at startup
 * locked      — vault key is not in memory
 * totpEnabled — TOTP 2FA is configured
 */
function status() {
  const auth = readAuth();
  const hasKey = fs.existsSync(KEY_PATH);

  if (!auth) {
    // Legacy mode: .key file exists but no auth.json
    if (hasKey) {
      if (!_vaultKey) _autoUnlockLegacy();
      return { hasAuth: false, legacyMode: true, locked: !isUnlocked(), totpEnabled: false };
    }
    // Fresh install with no key at all
    return { hasAuth: false, legacyMode: false, locked: true, totpEnabled: false };
  }

  return {
    hasAuth:     true,
    legacyMode:  false,
    locked:      !isUnlocked(),
    totpEnabled: !!(auth.totp?.enabled),
  };
}

/**
 * Auto-unlock from legacy .key file (no master password required).
 */
function _autoUnlockLegacy() {
  if (!fs.existsSync(KEY_PATH)) return false;
  try {
    _vaultKey = Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "hex");
    console.log("[auth] legacy mode: vault auto-unlocked from .key");
    return true;
  } catch {
    return false;
  }
}

/**
 * setup({ masterPassword, recoveryKey }) → { ok, recoveryKey }
 *
 * First-time setup. Generates a new vault key (or loads the existing .key for
 * legacy upgrades), encrypts it under masterPassword and recoveryKey, writes
 * auth.json, removes the old .key file if present.
 */
function setup(masterPassword, providedRecoveryKey) {
  if (!masterPassword || masterPassword.length < 8) {
    return { ok: false, error: "Master password must be at least 8 characters" };
  }

  // If a .key already exists (legacy upgrade) keep the same vault key so
  // existing encrypted passwords remain valid.
  let vaultKey;
  if (fs.existsSync(KEY_PATH)) {
    vaultKey = Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "hex");
  } else {
    vaultKey = crypto.randomBytes(32);
  }

  const recoveryKey = providedRecoveryKey
    ? normaliseRecoveryKey(providedRecoveryKey)
    : generateRecoveryKey();

  // Derive master key
  const masterSalt = crypto.randomBytes(SALT_LEN);
  const masterKey  = deriveKey(masterPassword, masterSalt);

  // Derive recovery key material
  const recoverySalt = crypto.randomBytes(SALT_LEN);
  const recoveryKeyBuf = Buffer.from(normaliseRecoveryKey(recoveryKey), "hex");
  const recoveryDerivedKey = deriveKey(recoveryKeyBuf, recoverySalt);

  const auth = {
    version:        1,
    iterations:     PBKDF2_ITERATIONS,
    masterSalt:     masterSalt.toString("hex"),
    encByMaster:    aesgcmEncrypt(masterKey, vaultKey),
    recoverySalt:   recoverySalt.toString("hex"),
    encByRecovery:  aesgcmEncrypt(recoveryDerivedKey, vaultKey),
    totp:           null,
  };

  writeAuth(auth);

  // Remove the old plain .key file — vault key is now protected by master password
  if (fs.existsSync(KEY_PATH)) {
    fs.unlinkSync(KEY_PATH);
    console.log("[auth] removed legacy .key file — vault is now password-protected");
  }

  _vaultKey = vaultKey;
  console.log("[auth] vault set up successfully");
  return { ok: true, recoveryKey };
}

/**
 * unlock({ masterPassword, totpCode }) → { ok, error }
 *
 * Derive key from masterPassword, decrypt the vault key, optionally verify TOTP.
 */
function unlock(masterPassword, userTotpCode) {
  const auth = readAuth();
  if (!auth) return { ok: false, error: "No auth configured" };

  // Derive master key and attempt decryption
  let vaultKey;
  try {
    const masterKey = deriveKey(
      masterPassword,
      Buffer.from(auth.masterSalt, "hex"),
    );
    vaultKey = aesgcmDecrypt(masterKey, auth.encByMaster);
  } catch {
    return { ok: false, error: "Invalid master password" };
  }

  // TOTP check (after password so timing doesn't reveal password validity)
  if (auth.totp?.enabled) {
    if (!userTotpCode) return { ok: false, error: "TOTP code required", totpRequired: true };
    // Decrypt the stored TOTP secret using the vault key we just derived
    let totpSecret;
    try {
      totpSecret = aesgcmDecrypt(vaultKey, auth.totp.encryptedSecret).toString("utf8");
    } catch {
      return { ok: false, error: "Failed to read TOTP secret" };
    }
    if (!verifyTotp(totpSecret, String(userTotpCode).padStart(6, "0"))) {
      return { ok: false, error: "Invalid TOTP code" };
    }
  }

  _vaultKey = vaultKey;
  console.log("[auth] vault unlocked");
  return { ok: true };
}

/**
 * recover({ recoveryKey, newMasterPassword }) → { ok, error }
 *
 * Decrypt vault key using recovery key, then re-encrypt under new master password.
 * TOTP is cleared on recovery.
 */
function recover(rawRecoveryKey, newMasterPassword) {
  const auth = readAuth();
  if (!auth) return { ok: false, error: "No auth configured" };

  if (!newMasterPassword || newMasterPassword.length < 8) {
    return { ok: false, error: "New master password must be at least 8 characters" };
  }

  const normalised = normaliseRecoveryKey(rawRecoveryKey);
  let vaultKey;
  try {
    const recoveryKeyBuf = Buffer.from(normalised, "hex");
    const recoveryDerivedKey = deriveKey(
      recoveryKeyBuf,
      Buffer.from(auth.recoverySalt, "hex"),
    );
    vaultKey = aesgcmDecrypt(recoveryDerivedKey, auth.encByRecovery);
  } catch {
    return { ok: false, error: "Invalid recovery key" };
  }

  // Re-encrypt under new master password
  const masterSalt = crypto.randomBytes(SALT_LEN);
  const masterKey  = deriveKey(newMasterPassword, masterSalt);
  const recoverySalt = crypto.randomBytes(SALT_LEN);
  const recoveryKeyBuf = Buffer.from(normalised, "hex");
  const recoveryDerivedKey = deriveKey(recoveryKeyBuf, recoverySalt);

  writeAuth({
    ...auth,
    iterations:    PBKDF2_ITERATIONS,
    masterSalt:    masterSalt.toString("hex"),
    encByMaster:   aesgcmEncrypt(masterKey, vaultKey),
    recoverySalt:  recoverySalt.toString("hex"),
    encByRecovery: aesgcmEncrypt(recoveryDerivedKey, vaultKey),
    totp:          null, // TOTP cleared on recovery — user must re-enroll
  });

  _vaultKey = vaultKey;
  console.log("[auth] vault recovered, master password reset, TOTP cleared");
  return { ok: true };
}

/**
 * setupTotp() → { secret, uri }
 *
 * Generate a new TOTP secret. Does NOT enable TOTP yet — caller must call
 * confirmTotp() after user scans and verifies.
 */
function setupTotp() {
  if (!isUnlocked()) return { ok: false, error: "Vault is locked" };
  const secret = generateTotpSecret();
  const uri    = totpUri(secret);
  return { ok: true, secret, uri };
}

/**
 * confirmTotp(secret, code) → { ok, error }
 *
 * Verify the user's code, then encrypt the secret and persist to auth.json.
 */
function confirmTotp(secret, code) {
  if (!isUnlocked()) return { ok: false, error: "Vault is locked" };
  if (!verifyTotp(secret, String(code).padStart(6, "0"))) {
    return { ok: false, error: "TOTP code does not match — try again" };
  }

  const auth = readAuth();
  if (!auth) return { ok: false, error: "No auth configured" };

  const encryptedSecret = aesgcmEncrypt(_vaultKey, Buffer.from(secret, "utf8"));
  writeAuth({ ...auth, totp: { enabled: true, encryptedSecret } });
  console.log("[auth] TOTP enabled");
  return { ok: true };
}

/**
 * disableTotp(code) → { ok, error }
 *
 * Verify TOTP then disable it.
 */
function disableTotp(code) {
  if (!isUnlocked()) return { ok: false, error: "Vault is locked" };

  const auth = readAuth();
  if (!auth?.totp?.enabled) return { ok: false, error: "TOTP is not enabled" };

  let totpSecret;
  try {
    totpSecret = aesgcmDecrypt(_vaultKey, auth.totp.encryptedSecret).toString("utf8");
  } catch {
    return { ok: false, error: "Failed to read TOTP secret" };
  }

  if (!verifyTotp(totpSecret, String(code).padStart(6, "0"))) {
    return { ok: false, error: "Invalid TOTP code" };
  }

  writeAuth({ ...auth, totp: null });
  console.log("[auth] TOTP disabled");
  return { ok: true };
}

// ── Boot: auto-unlock legacy installs ─────────────────────────────────────────

(function bootAutoUnlock() {
  const auth = readAuth();
  if (!auth && fs.existsSync(KEY_PATH)) {
    _autoUnlockLegacy();
  }
})();

/**
 * wrapKeyForExport(passphrase) → { exportSalt, vaultKeyEnc }
 *
 * Derives a key from passphrase and wraps the vault key under it.
 * Safe to store in an export file — the vault key is not recoverable without
 * knowing the passphrase.
 */
function wrapKeyForExport(passphrase) {
  if (!_vaultKey) return { ok: false, error: "Vault is locked" };
  if (!passphrase) return { ok: false, error: "Passphrase required" };
  const salt    = crypto.randomBytes(SALT_LEN);
  const derived = deriveKey(passphrase, salt);
  return {
    ok:           true,
    exportSalt:   salt.toString("hex"),
    vaultKeyEnc:  aesgcmEncrypt(derived, _vaultKey),
  };
}

/**
 * unwrapExportKey(passphrase, exportSalt, vaultKeyEnc) → Buffer
 *
 * Reverse of wrapKeyForExport. Throws if the passphrase is wrong.
 */
function unwrapExportKey(passphrase, exportSalt, vaultKeyEnc) {
  const derived = deriveKey(passphrase, Buffer.from(exportSalt, "hex"));
  return aesgcmDecrypt(derived, vaultKeyEnc); // throws on bad passphrase/tampered data
}

module.exports = {
  status,
  setup,
  unlock,
  lock,
  recover,
  isUnlocked,
  getVaultKey,
  setupTotp,
  confirmTotp,
  disableTotp,
  wrapKeyForExport,
  unwrapExportKey,
  // Exposed for tests
  generateRecoveryKey,
  normaliseRecoveryKey,
  totpCode,
  verifyTotp,
  totpUri,
};
