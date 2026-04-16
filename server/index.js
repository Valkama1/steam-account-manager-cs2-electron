const express         = require("express");
const cors            = require("cors");
const fs              = require("fs");
const path            = require("path");
const { exec, execFile, spawn } = require("child_process");
const { v4: uuidv4 }  = require("uuid");

const { encryptPassword, decryptPassword } = require("./crypto.js");
const { readConfig, writeConfig }                                   = require("./config.js");
const { readDB, writeDB, sanitize }                                 = require("./db.js");
const { fetchSteamFields, fetchBanDataBatch, fetchPlayerSummariesBatch, fetchGameData, fetchCS2Stats, fetchLeetifyProfile, getSteamPath, killSteam, setSteamAutoLogin, setAutoLoginRegistry } = require("./steam.js");
const { readWatchlist, writeWatchlist, addEntry, checkAllBans, startWatchInterval } = require("./watchlist.js");
const { readNotifications, addNotification, clearAll: clearAllNotifications, clearOne: clearOneNotification } = require("./notifications.js");

const DEBUG = process.env.DEBUG === "1";
const dbg = (...args) => { if (DEBUG) console.log(...args); };

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Accounts ──────────────────────────────────────────────────────────────────

app.get("/api/accounts", (req, res) => {
  res.json(readDB().map(sanitize));
});

// ── Batch refresh all accounts ─────────────────────────────────────────────
// Must be before /:id so Express doesn't treat "refresh-all" as an id.

app.post("/api/accounts/refresh-all", async (_req, res) => {
  const accounts = readDB();
  const withId   = accounts.filter(a => a.steamId64);
  if (!withId.length) return res.json(accounts.map(sanitize));

  const ids = withId.map(a => a.steamId64);

  // One API call each for bans and summaries (handles up to 100 per call)
  const [bansMap, summariesMap] = await Promise.all([
    fetchBanDataBatch(ids),
    fetchPlayerSummariesBatch(ids),
  ]);

  // GetOwnedGames can't be batched — run 5 at a time to stay within rate limits
  const gameMap = {};
  let cursor = 0;
  async function gameWorker() {
    while (cursor < withId.length) {
      const acc = withId[cursor++];
      const g = await fetchGameData(acc.steamId64);
      if (g) gameMap[acc.steamId64] = g;
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, withId.length) }, gameWorker));

  // Write updates + detect new bans
  for (const acc of withId) {
    const i = accounts.findIndex(a => a.id === acc.id);
    if (i === -1) continue;
    const bans    = bansMap[acc.steamId64];
    const summary = summariesMap[acc.steamId64];
    const games   = gameMap[acc.steamId64];

    if (bans) {
      const old  = accounts[i];
      const name = old.alias || old.profileName || old.name;
      if (!old.vacBanned && bans.vacBanned)
        addNotification({ type: "vac_ban",  source: "account", accountName: name, steamId64: old.steamId64 });
      if ((old.gameBans || 0) < bans.gameBans)
        addNotification({ type: "game_ban", source: "account", accountName: name, steamId64: old.steamId64 });
    }

    accounts[i] = {
      ...accounts[i],
      ...(summary && { avatar: summary.avatar, profileName: summary.profileName }),
      ...(bans    && { vacBanned: bans.vacBanned, gameBans: bans.gameBans, daysSinceLastBan: bans.daysSinceLastBan }),
      ...(games   && { cs2Hours: games.cs2Hours, cs2LastPlayed: games.cs2LastPlayed }),
    };
  }

  writeDB(accounts);
  res.json(accounts.map(sanitize));
});

app.post("/api/accounts", async (req, res) => {
  const { name, alias, prime, premierReady, expires, cooldownInput, cooldownType, profileUrl, password } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const steamFields = await fetchSteamFields(profileUrl);
  const accounts = readDB();
  const account = {
    id: uuidv4(), name, alias: alias || "",
    prime: !!prime, premierReady: !!premierReady,
    password: password ? encryptPassword(password) : null,
    expires: expires || null,
    cooldownHistory: expires ? [{ input: cooldownInput || null, type: cooldownType || null, startedAt: new Date().toISOString(), expiresAt: expires }] : [],
    ...steamFields,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  writeDB(accounts);
  res.status(201).json(sanitize(account));
});

app.get("/api/accounts/export", (_req, res) => {
  const accounts = readDB().map(sanitize); // never export raw passwords
  res.setHeader("Content-Disposition", `attachment; filename="steam-manager-export-${new Date().toISOString().slice(0,10)}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(accounts, null, 2));
});

app.post("/api/accounts/import", (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: "Expected an array of accounts" });
  const existing = readDB();
  const existingIds = new Set(existing.map(a => a.id));
  let added = 0;
  for (const acc of incoming) {
    if (!acc.name) continue;
    if (existingIds.has(acc.id)) continue; // skip duplicates
    existing.push({ ...acc, id: acc.id || uuidv4(), password: null }); // never import passwords
    added++;
  }
  writeDB(existing);
  res.json({ added, total: existing.length });
});

app.post("/api/accounts/clear-cache", (_req, res) => {
  const STEAM_FIELDS = ["avatar", "profileName", "vacBanned", "gameBans", "daysSinceLastBan", "cs2Hours", "cs2LastPlayed"];
  const accounts = readDB().map(a => {
    const cleared = {};
    for (const f of STEAM_FIELDS) cleared[f] = null;
    return { ...a, ...cleared };
  });
  writeDB(accounts);
  res.json(accounts.map(sanitize));
});

app.get("/api/accounts/:id/leetify", async (req, res) => {
  const acc = readDB().find(a => a.id === req.params.id);
  if (!acc) return res.status(404).json({ error: "not found" });
  if (!acc.steamId64) return res.status(400).json({ error: "no_steam_id" });
  const profile = await fetchLeetifyProfile(acc.steamId64);
  if (!profile) return res.status(502).json({ error: "leetify_error" });
  res.json(profile);
});

app.patch("/api/accounts/:id", async (req, res) => {
  const accounts = readDB();
  const idx = accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const { profileUrl, cooldownInput, cooldownType, ...rest } = req.body;
  if (rest.password !== undefined) {
    rest.password = rest.password ? encryptPassword(rest.password) : null;
  }
  if (rest.expires !== undefined && rest.expires !== null) {
    const entry = { input: cooldownInput || null, type: cooldownType || null, startedAt: new Date().toISOString(), expiresAt: rest.expires };
    rest.cooldownHistory = [...(accounts[idx].cooldownHistory || []), entry];
  }
  const steamFields = profileUrl !== undefined ? await fetchSteamFields(profileUrl) : {};
  accounts[idx] = { ...accounts[idx], ...rest, ...steamFields };
  writeDB(accounts);
  res.json(sanitize(accounts[idx]));
});

app.delete("/api/accounts/:id", (req, res) => {
  const accounts = readDB();
  const filtered = accounts.filter(a => a.id !== req.params.id);
  if (filtered.length === accounts.length) return res.status(404).json({ error: "not found" });
  writeDB(filtered);
  res.json({ ok: true });
});

// ── Account switching ─────────────────────────────────────────────────────────

let switchQueue = Promise.resolve();

app.post("/api/switch/:id", (req, res) => {
  switchQueue = switchQueue.then(() => doSwitch(req.params.id, res));
});

// doSwitch(accountId, res) — shared by /api/switch/:id and the automation endpoint.
// Writes the HTTP response itself; callers must not write res after this.
async function doSwitch(accountId, res) {
  const accounts = readDB();
  const account  = accounts.find(a => a.id === accountId);
  if (!account) return res.status(404).json({ error: "not found" });

  const username   = account.name.toLowerCase();
  const steamInfo  = await getSteamPath();
  if (!steamInfo) return res.status(500).json({ error: "Steam executable not found" });
  const { exe: steamExe, dir: steamDir } = steamInfo;

  // Fast path — use cached session token from loginusers.vdf
  const loginUsersPath = path.join(steamDir, "config", "loginusers.vdf");
  const inVdf = account.steamId64 &&
                fs.existsSync(loginUsersPath) &&
                fs.readFileSync(loginUsersPath, "utf8").includes(account.steamId64);

  if (inVdf) {
    dbg(`[switch] fast-path → ${username} (steamId64=${account.steamId64})`);
    const wasRunning = await killSteam(steamExe);
    if (wasRunning) {
      dbg(`[switch] Steam killed, waiting 200ms for file handles to release`);
      await new Promise(r => setTimeout(r, 200));
    }
    const vdfOk = setSteamAutoLogin(steamDir, account.steamId64);
    dbg(`[switch] setSteamAutoLogin returned ${vdfOk}`);

    if (process.platform === "linux") {
      setAutoLoginRegistry(steamDir, username);
    } else {
      await Promise.all([
        new Promise(r => execFile("reg", ["add", "HKCU\\SOFTWARE\\Valve\\Steam", "/v", "AutoLoginUser", "/t", "REG_SZ", "/d", username, "/f"], r)),
        new Promise(r => execFile("reg", ["add", "HKCU\\SOFTWARE\\Valve\\Steam", "/v", "RememberPassword", "/t", "REG_DWORD", "/d", "1", "/f"], r)),
      ]);
    }

    dbg(`[switch] registry set, launching Steam`);
    const fastPassword = account.password ? decryptPassword(account.password) : null;
    const spawnArgs    = fastPassword ? ["-login", username, fastPassword] : [];
    const fastChild    = spawn(steamExe, spawnArgs, { detached: true, stdio: "ignore", windowsHide: !!fastPassword });
    fastChild.on("error", e => console.error(`[switch] spawn error: ${e.message}`));
    fastChild.unref();

    return res.json({ ok: true });
  }

  // Password path — fallback for first-time login on this machine
  if (!account.password)
    return res.status(400).json({ error: "Account not in loginusers.vdf — log into Steam manually once, then switching will work automatically." });

  const plainPassword = decryptPassword(account.password);
  if (!plainPassword) return res.status(500).json({ error: "Failed to decrypt password" });

  dbg(`[switch] password path → ${username}`);
  const wasRunning = await killSteam(steamExe);
  if (wasRunning) await new Promise(r => setTimeout(r, 200));

  const child = spawn(steamExe, ["-login", username, plainPassword], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", e => console.error(`[switch] spawn error: ${e.message}`));
  child.unref();

  return res.json({ ok: true });
}

// ── Misc routes ───────────────────────────────────────────────────────────────

app.get("/api/steam-active", (req, res) => {
  if (process.platform === "linux") {
    exec("pgrep steam", async (_err, stdout) => {
      const running = !!(stdout && stdout.trim());
      if (!running) return res.json({ running: false, account: null });
      // Read AutoLoginUser from registry.vdf
      try {
        const steamInfo = await getSteamPath();
        if (!steamInfo) return res.json({ running: true, account: null });
        const regPath = path.join(steamInfo.dir, "registry.vdf");
        if (!fs.existsSync(regPath)) return res.json({ running: true, account: null });
        const raw = fs.readFileSync(regPath, "utf8");
        const match = raw.match(/"AutoLoginUser"\s+"([^"]+)"/i);
        res.json({ running: true, account: match ? match[1] : null });
      } catch { res.json({ running: true, account: null }); }
    });
    return;
  }

  exec('tasklist /FI "IMAGENAME eq steam.exe" /NH', (err, stdout) => {
    const running = !!(stdout && stdout.toLowerCase().includes("steam.exe"));
    if (!running) return res.json({ running: false, account: null });
    exec('reg query "HKCU\\SOFTWARE\\Valve\\Steam" /v AutoLoginUser', (err2, stdout2) => {
      const match = stdout2?.match(/AutoLoginUser\s+REG_SZ\s+(.+)/);
      res.json({ running: true, account: match ? match[1].trim() : null });
    });
  });
});

app.get("/api/config", (req, res) => res.json(readConfig()));
const ALLOWED_CONFIG_KEYS = new Set(["steamApiKey", "leetifyApiKey", "lastRefreshed"]);
app.patch("/api/config", (req, res) => {
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => ALLOWED_CONFIG_KEYS.has(k))
  );
  const config = { ...readConfig(), ...updates };
  writeConfig(config);
  res.json(config);
});

// ── Ban watchlist ─────────────────────────────────────────────────────────────
// NOTE: /check must be registered before /:id so Express doesn't treat "check" as an id

app.get("/api/watchlist", (_req, res) => res.json(readWatchlist()));

app.post("/api/watchlist/check", async (_req, res) => {
  const list = await checkAllBans();
  res.json(list);
});

app.post("/api/watchlist", async (req, res) => {
  const { profileUrl } = req.body;
  if (!profileUrl) return res.status(400).json({ error: "profileUrl is required" });
  try {
    const entry = await addEntry(profileUrl);
    res.status(201).json(entry);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/watchlist/:id", (req, res) => {
  const list = readWatchlist();
  const idx  = list.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  list[idx] = { ...list[idx], ...req.body };
  writeWatchlist(list);
  res.json(list[idx]);
});

app.delete("/api/watchlist/:id", (req, res) => {
  const list     = readWatchlist();
  const filtered = list.filter(e => e.id !== req.params.id);
  if (filtered.length === list.length) return res.status(404).json({ error: "not found" });
  writeWatchlist(filtered);
  res.json({ ok: true });
});

// ── Notifications ─────────────────────────────────────────────────────────────

app.get("/api/notifications", (_req, res) => res.json(readNotifications()));

app.delete("/api/notifications", (_req, res) => {
  clearAllNotifications();
  res.json({ ok: true });
});

app.delete("/api/notifications/:id", (req, res) => {
  clearOneNotification(req.params.id);
  res.json({ ok: true });
});

// ── Automation API ────────────────────────────────────────────────────────────
// These endpoints are designed to be called by external programs without the UI.
// All endpoints return JSON. The server listens on http://localhost:3001.

// Drop week logic (mirrors client/src/cooldown.js).
// CS2 drops reset every Wednesday at 01:00 UTC.
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

function isDropEligible(acc) {
  const weekStart = getCurrentWeekStart();
  if (!acc.prime) return false;
  if ((acc.weeklyDrops || []).some(d => d.weekStart === weekStart)) return false;
  if (acc.vacBanned || (acc.gameBans || 0) > 0) return false;
  const nextReset = new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000;
  if (acc.expires && new Date(acc.expires) > new Date() && new Date(acc.expires).getTime() > nextReset)
    return false;
  return true;
}

// GET /api/automation — list all automation endpoints
app.get("/api/automation", (_req, res) => {
  const base = `http://localhost:${PORT}`;
  res.json({
    description: "Steam Manager automation API",
    weekStart: getCurrentWeekStart(),
    endpoints: [
      { method: "GET",    url: `${base}/api/accounts`,                    description: "List all accounts" },
      { method: "PATCH",  url: `${base}/api/accounts/:id`,                description: "Update any account field (e.g. weeklyDrops)" },
      { method: "POST",   url: `${base}/api/switch/:id`,                  description: "Switch Steam to an account by id" },
      { method: "POST",   url: `${base}/api/accounts/:id/drop`,           description: "Mark account as having received a drop this week" },
      { method: "DELETE", url: `${base}/api/accounts/:id/drop`,           description: "Remove the current week's drop mark from an account" },
      { method: "GET",    url: `${base}/api/automation/next-drop`,        description: "Find the next Prime account without a drop this week" },
      { method: "POST",   url: `${base}/api/automation/next-drop/switch`, description: "Switch Steam to the next drop-eligible account" },
      { method: "GET",    url: `${base}/api/steam-active`,                description: "Check if Steam is running and which account is logged in" },
    ],
  });
});

// POST /api/accounts/:id/drop — mark current week's drop as received (idempotent)
app.post("/api/accounts/:id/drop", (req, res) => {
  const db  = readDB();
  const idx = db.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const weekStart = getCurrentWeekStart();
  const drops     = db[idx].weeklyDrops || [];
  if (!drops.some(d => d.weekStart === weekStart)) {
    db[idx].weeklyDrops = [...drops, { weekStart }];
    writeDB(db);
  }
  res.json({ ok: true, weekStart, account: sanitize(db[idx]) });
});

// DELETE /api/accounts/:id/drop — remove current week's drop mark
app.delete("/api/accounts/:id/drop", (req, res) => {
  const db  = readDB();
  const idx = db.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const weekStart     = getCurrentWeekStart();
  db[idx].weeklyDrops = (db[idx].weeklyDrops || []).filter(d => d.weekStart !== weekStart);
  writeDB(db);
  res.json({ ok: true, weekStart, account: sanitize(db[idx]) });
});

// GET /api/automation/next-drop — peek at the next eligible account without switching
// Must be before /:id routes so "next-drop" isn't treated as an id
app.get("/api/automation/next-drop", (_req, res) => {
  const weekStart = getCurrentWeekStart();
  const accounts  = readDB();
  const eligible  = accounts.filter(isDropEligible);
  const next      = eligible[0] ?? null;
  res.json({
    found:         !!next,
    weekStart,
    remaining:     eligible.length,
    account:       next ? sanitize(next) : null,
  });
});

// POST /api/automation/next-drop/switch — switch to the next drop-eligible account
app.post("/api/automation/next-drop/switch", (_req, res) => {
  switchQueue = switchQueue.then(async () => {
    const weekStart = getCurrentWeekStart();
    const accounts  = readDB();
    const eligible  = accounts.filter(isDropEligible);
    const next      = eligible[0] ?? null;
    if (!next) return res.json({
      found: false,
      weekStart,
      message: "All eligible accounts have already received a drop this week",
    });
    // Intercept the switch response to add account info before sending
    const origJson = res.json.bind(res);
    res.json = (body) => {
      res.json = origJson;
      return origJson(body.ok
        ? { ...body, found: true, remaining: eligible.length - 1, weekStart, account: sanitize(next) }
        : body);
    };
    await doSwitch(next.id, res);
  });
});

// ── Static (production / Electron) ───────────────────────────────────────────

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

// ── Start ─────────────────────────────────────────────────────────────────────

function startServer(port) {
  return new Promise(resolve => app.listen(port || PORT, () => {
    startWatchInterval();
    resolve();
  }));
}

if (require.main === module) {
  startServer().then(() => console.log(`API running on http://localhost:${PORT}`));
}

module.exports = { app, startServer, setSteamAutoLogin, encryptPassword, decryptPassword };
