const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 }               = require("uuid");
const { fetchSteamProfile, fetchBanData } = require("./steam.js");

const DATA_DIR       = process.env.DATA_DIR || __dirname;
const WATCHLIST_PATH = path.join(DATA_DIR, "watchlist.json");
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function readWatchlist() {
  if (!fs.existsSync(WATCHLIST_PATH)) fs.writeFileSync(WATCHLIST_PATH, "[]");
  return JSON.parse(fs.readFileSync(WATCHLIST_PATH, "utf8"));
}

function writeWatchlist(data) {
  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(data, null, 2));
}

async function addEntry(profileUrl) {
  // For /profiles/<id>/ URLs the steamId64 is in the URL itself — don't rely on the deprecated /?xml=1 API
  const directId = profileUrl.match(/\/profiles\/(\d{15,})/)?.[1];
  const profile  = await fetchSteamProfile(profileUrl); // still fetches name/avatar if available
  const steamId64 = directId || profile?.steamId64;
  if (!steamId64) throw new Error("Could not resolve Steam profile — check the URL and try again");

  const list = readWatchlist();
  if (list.some(e => e.steamId64 === steamId64)) throw new Error("Already watching this account");

  const bans        = await fetchBanData(steamId64);
  const alreadyBanned = !!(bans?.vacBanned || (bans?.gameBans ?? 0) > 0);

  const entry = {
    id:               uuidv4(),
    profileUrl,
    steamId64,
    profileName:      profile?.profileName || null,
    avatar:           profile?.avatar      || null,
    addedAt:          new Date().toISOString(),
    lastChecked:      new Date().toISOString(),
    vacBanned:        bans?.vacBanned        ?? false,
    gameBans:         bans?.gameBans         ?? 0,
    daysSinceLastBan: bans?.daysSinceLastBan ?? null,
    bannedAt:         alreadyBanned ? new Date().toISOString() : null,
    notified:         alreadyBanned, // already banned → no new notification needed
  };

  list.push(entry);
  writeWatchlist(list);
  return entry;
}

async function checkAllBans() {
  const list = readWatchlist();
  if (!list.length) return list;

  for (const entry of list) {
    if (!entry.steamId64) continue;
    try {
      const bans = await fetchBanData(entry.steamId64);
      if (!bans) continue;

      const wasClean = !entry.vacBanned && !(entry.gameBans > 0);
      const nowBanned = !!(bans.vacBanned || bans.gameBans > 0);

      entry.vacBanned        = bans.vacBanned;
      entry.gameBans         = bans.gameBans;
      entry.daysSinceLastBan = bans.daysSinceLastBan;
      entry.lastChecked      = new Date().toISOString();

      if (wasClean && nowBanned) {
        entry.bannedAt = new Date().toISOString();
        entry.notified = false; // client will show desktop notification on next poll
        console.log(`[watchlist] ban detected: ${entry.profileName} (${entry.steamId64})`);
      }
    } catch (e) {
      console.error(`[watchlist] error checking ${entry.steamId64}:`, e.message);
    }
  }

  writeWatchlist(list);
  console.log(`[watchlist] checked ${list.length} account(s)`);
  return list;
}

function startWatchInterval() {
  // First check 1 min after start so the server is fully settled
  setTimeout(checkAllBans, 60 * 1000);
  setInterval(checkAllBans, CHECK_INTERVAL_MS);
  console.log(`[watchlist] auto-check every ${CHECK_INTERVAL_MS / 3_600_000}h`);
}

module.exports = { readWatchlist, writeWatchlist, addEntry, checkAllBans, startWatchInterval };
