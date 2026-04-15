const fs   = require("fs");
const path = require("path");
const { v4: uuidv4 }               = require("uuid");
const { fetchSteamProfile, fetchBanData, fetchBanDataBatch } = require("./steam.js");
const { addNotification } = require("./notifications.js");

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
    // Baseline = ban state at time of adding. Future checks notify only when bans EXCEED this.
    baselineVacBanned: bans?.vacBanned ?? false,
    baselineGameBans:  bans?.gameBans  ?? 0,
    bannedAt:         alreadyBanned ? new Date().toISOString() : null,
    notified:         true, // never notify for bans that existed when the account was added
  };

  list.push(entry);
  writeWatchlist(list);
  return entry;
}

async function checkAllBans() {
  const list = readWatchlist();
  if (!list.length) return list;

  const ids    = list.map(e => e.steamId64).filter(Boolean);
  const bansMap = await fetchBanDataBatch(ids); // one API call for all accounts

  for (const entry of list) {
    if (!entry.steamId64) continue;
    const bans = bansMap[entry.steamId64];
    if (!bans) continue;

    // Compare against the ban state when this account was added (the baseline).
    // This way accounts with pre-existing bans still get monitored for NEW bans.
    const baselineVac  = entry.baselineVacBanned ?? entry.vacBanned  ?? false;
    const baselineGame = entry.baselineGameBans  ?? entry.gameBans   ?? 0;
    const newVac       = bans.vacBanned && !baselineVac;
    const newGameBans  = bans.gameBans > baselineGame;

    entry.vacBanned        = bans.vacBanned;
    entry.gameBans         = bans.gameBans;
    entry.daysSinceLastBan = bans.daysSinceLastBan;
    entry.lastChecked      = new Date().toISOString();

    if (newVac || newGameBans) {
      entry.bannedAt = new Date().toISOString();
      entry.notified = false;
      // Advance the baseline so a second check doesn't re-fire for the same ban
      entry.baselineVacBanned = bans.vacBanned;
      entry.baselineGameBans  = bans.gameBans;
      console.log(`[watchlist] new ban detected: ${entry.profileName} (${entry.steamId64})`);
      const name = entry.profileName || entry.steamId64;
      if (newVac)      addNotification({ type: "vac_ban",  source: "watchlist", accountName: name, steamId64: entry.steamId64 });
      if (newGameBans) addNotification({ type: "game_ban", source: "watchlist", accountName: name, steamId64: entry.steamId64 });
    }
  }

  writeWatchlist(list);
  console.log(`[watchlist] checked ${list.length} account(s) in one batch request`);
  return list;
}

function startWatchInterval() {
  // First check 1 min after start so the server is fully settled
  setTimeout(checkAllBans, 60 * 1000);
  setInterval(checkAllBans, CHECK_INTERVAL_MS);
  console.log(`[watchlist] auto-check every ${CHECK_INTERVAL_MS / 3_600_000}h`);
}

module.exports = { readWatchlist, writeWatchlist, addEntry, checkAllBans, startWatchInterval };
