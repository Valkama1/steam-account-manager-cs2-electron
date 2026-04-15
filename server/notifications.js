const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_DIR         = process.env.DATA_DIR || __dirname;
const NOTIF_PATH       = path.join(DATA_DIR, "notifications.json");

function readNotifications() {
  if (!fs.existsSync(NOTIF_PATH)) fs.writeFileSync(NOTIF_PATH, "[]");
  try { return JSON.parse(fs.readFileSync(NOTIF_PATH, "utf8")); }
  catch { return []; }
}

function writeNotifications(data) {
  fs.writeFileSync(NOTIF_PATH, JSON.stringify(data, null, 2));
}

function addNotification({ type, source, accountName, steamId64 }) {
  const notifications = readNotifications();
  // Deduplicate: don't re-add if same account+type already unread
  const dupe = notifications.find(n => n.steamId64 === steamId64 && n.type === type);
  if (dupe) return;
  notifications.unshift({
    id:          uuidv4(),
    type,        // "vac_ban" | "game_ban"
    source,      // "account" | "watchlist"
    accountName,
    steamId64,
    createdAt:   new Date().toISOString(),
  });
  writeNotifications(notifications);
}

function clearAll() {
  writeNotifications([]);
}

function clearOne(id) {
  const notifications = readNotifications().filter(n => n.id !== id);
  writeNotifications(notifications);
}

module.exports = { readNotifications, addNotification, clearAll, clearOne };
