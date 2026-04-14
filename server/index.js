const express         = require("express");
const cors            = require("cors");
const fs              = require("fs");
const path            = require("path");
const { exec, spawn } = require("child_process");
const { v4: uuidv4 }  = require("uuid");

const { encryptPassword, decryptPassword, generateSteamGuardCode } = require("./crypto.js");
const { readConfig, writeConfig }                                   = require("./config.js");
const { readDB, writeDB, sanitize }                                 = require("./db.js");
const { fetchSteamFields, fetchBanDataBatch, fetchPlayerSummariesBatch, fetchGameData, getSteamPath, killSteam, setSteamAutoLogin } = require("./steam.js");
const { readWatchlist, writeWatchlist, addEntry, checkAllBans, startWatchInterval } = require("./watchlist.js");

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

  // Write updates
  for (const acc of withId) {
    const i = accounts.findIndex(a => a.id === acc.id);
    if (i === -1) continue;
    const bans    = bansMap[acc.steamId64];
    const summary = summariesMap[acc.steamId64];
    const games   = gameMap[acc.steamId64];
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
  const { name, alias, prime, premierReady, expires, cooldownInput, profileUrl, password } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const steamFields = await fetchSteamFields(profileUrl);
  const accounts = readDB();
  const account = {
    id: uuidv4(), name, alias: alias || "",
    prime: !!prime, premierReady: !!premierReady,
    password: password ? encryptPassword(password) : null,
    expires: expires || null,
    cooldownHistory: expires ? [{ input: cooldownInput || null, startedAt: new Date().toISOString(), expiresAt: expires }] : [],
    ...steamFields,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  writeDB(accounts);
  res.status(201).json(sanitize(account));
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

app.patch("/api/accounts/:id", async (req, res) => {
  const accounts = readDB();
  const idx = accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const { profileUrl, cooldownInput, ...rest } = req.body;
  if (rest.password !== undefined) {
    rest.password = rest.password ? encryptPassword(rest.password) : null;
  }
  if (rest.expires !== undefined && rest.expires !== null) {
    const entry = { input: cooldownInput || null, startedAt: new Date().toISOString(), expiresAt: rest.expires };
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
  switchQueue = switchQueue.then(() => doSwitch(req, res));
});

async function doSwitch(req, res) {
  const accounts = readDB();
  const account  = accounts.find(a => a.id === req.params.id);
  if (!account) return res.status(404).json({ error: "not found" });

  const username  = account.name.toLowerCase();
  const steamPath = await getSteamPath();
  if (!steamPath) return res.status(500).json({ error: "Steam executable not found" });
  const steamDir = path.dirname(steamPath);

  // Fast path — use cached session token from loginusers.vdf
  const loginUsersPath = path.join(steamDir, "config", "loginusers.vdf");
  const inVdf = account.steamId64 &&
                fs.existsSync(loginUsersPath) &&
                fs.readFileSync(loginUsersPath, "utf8").includes(account.steamId64);

  if (inVdf) {
    dbg(`[switch] fast-path → ${username} (steamId64=${account.steamId64})`);
    await killSteam();
    dbg(`[switch] Steam down, waiting 1500ms`);
    await new Promise(r => setTimeout(r, 1500));
    const vdfOk = setSteamAutoLogin(steamDir, account.steamId64);
    dbg(`[switch] setSteamAutoLogin returned ${vdfOk}`);
    await new Promise(r => exec(`reg add "HKCU\\SOFTWARE\\Valve\\Steam" /v AutoLoginUser /t REG_SZ /d "${username}" /f`, r));
    await new Promise(r => exec(`reg add "HKCU\\SOFTWARE\\Valve\\Steam" /v RememberPassword /t REG_DWORD /d 1 /f`, r));
    dbg(`[switch] registry set, launching Steam`);
    const fastPassword = account.password ? decryptPassword(account.password) : null;
    const spawnArgs    = fastPassword ? ["-login", username, fastPassword] : [];
    const fastChild    = spawn(steamPath, spawnArgs, { cwd: steamDir, detached: true, stdio: "ignore", windowsHide: !!fastPassword });
    fastChild.on("error", e => console.error(`[switch] spawn error: ${e.message}`));
    fastChild.unref();

    if (fastPassword && account.sharedSecret) {
      const totpCode = generateSteamGuardCode(account.sharedSecret);
      const ps1Path  = path.join(__dirname, "2fa.ps1");
      spawn("powershell.exe",
        ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", ps1Path, totpCode],
        { detached: true, stdio: "ignore", windowsHide: true }
      ).unref();
    }

    return res.json({ ok: true });
  }

  // Password path — fallback for first-time login on this machine
  if (!account.password)
    return res.status(400).json({ error: "Account not in loginusers.vdf — log into Steam manually once, then switching will work automatically." });

  const plainPassword = decryptPassword(account.password);
  if (!plainPassword) return res.status(500).json({ error: "Failed to decrypt password" });

  dbg(`[switch] password path → ${username}`);
  await killSteam();
  await new Promise(r => setTimeout(r, 1500));

  const child = spawn(steamPath, ["-login", username, plainPassword], { cwd: steamDir, detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", e => console.error(`[switch] spawn error: ${e.message}`));
  child.unref();

  if (account.sharedSecret) {
    const totpCode = generateSteamGuardCode(account.sharedSecret);
    const ps1Path  = path.join(__dirname, "2fa.ps1");
    spawn("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", ps1Path, totpCode],
      { detached: true, stdio: "ignore", windowsHide: true }
    ).unref();
  }

  return res.json({ ok: true });
}

// ── Misc routes ───────────────────────────────────────────────────────────────

app.get("/api/steam-active", (req, res) => {
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
app.patch("/api/config", (req, res) => {
  const config = { ...readConfig(), ...req.body };
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
