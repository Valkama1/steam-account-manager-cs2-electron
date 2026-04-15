const fs   = require("fs");
const path = require("path");
const { encryptPassword, ENC_PREFIX } = require("./crypto.js");

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH  = process.env.TEST_DB_PATH || path.join(DATA_DIR, "accounts.json");

function readDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]");
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Encrypt any plain-text passwords left in the DB from before encryption was added
function migratePasswords() {
  if (!fs.existsSync(DB_PATH)) return;
  const accounts = readDB();
  let changed = false;
  for (const acc of accounts) {
    if (acc.password && !acc.password.startsWith(ENC_PREFIX)) {
      acc.password = encryptPassword(acc.password);
      changed = true;
    }
  }
  if (changed) {
    writeDB(accounts);
    console.log("[migration] encrypted plain-text passwords in accounts.json");
  }
}

// Strip sensitive fields before sending to client
function sanitize(account) {
  const { password, sharedSecret, ...rest } = account;
  return { ...rest, hasPassword: !!password };
}

migratePasswords();

module.exports = { readDB, writeDB, sanitize, DB_PATH };
