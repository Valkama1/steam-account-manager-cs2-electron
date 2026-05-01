const express         = require("express");
const cors            = require("cors");
const fs              = require("fs");
const path            = require("path");
const https           = require("https");
const { exec, execFile, spawn } = require("child_process");
const { v4: uuidv4 }  = require("uuid");

const { encryptPassword, decryptPassword, encryptWithKey, decryptWithKey, ENC_PREFIX } = require("./crypto.js");
const { readConfig, writeConfig }                                   = require("./config.js");
const { readDB, writeDB, sanitize }                                 = require("./db.js");
const { fetchSteamFields, fetchBanDataBatch, fetchPlayerSummariesBatch, fetchGameData, fetchCS2Stats, fetchLeetifyProfile, getSteamPath, killSteam, setSteamAutoLogin, setAutoLoginRegistry } = require("./steam.js");
const { readWatchlist, writeWatchlist, addEntry, checkAllBans, startWatchInterval } = require("./watchlist.js");
const { readShortcuts, writeShortcuts } = require("./shortcuts.js");
const { readNotifications, addNotification, addPatchNoteNotification, clearAll: clearAllNotifications, clearOne: clearOneNotification } = require("./notifications.js");
const auth = require("./auth.js");

const DEBUG = process.env.DEBUG === "1";
const dbg = (...args) => { if (DEBUG) console.log(...args); };

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireUnlocked(req, res, next) {
  // In legacy mode (no master password set), vault is always unlocked
  const s = auth.status();
  if (s.legacyMode || s.hasAuth === false) return next(); // no auth configured at all
  if (!auth.isUnlocked()) return res.status(401).json({ error: "Vault is locked", locked: true });
  next();
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

// GET /api/auth/status
app.get("/api/auth/status", (_req, res) => {
  res.json(auth.status());
});

// POST /api/auth/setup  { masterPassword }  → { ok, recoveryKey }
app.post("/api/auth/setup", (req, res) => {
  const { masterPassword } = req.body;
  if (!masterPassword) return res.status(400).json({ error: "masterPassword required" });
  const result = auth.setup(masterPassword);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// POST /api/auth/unlock  { masterPassword, totpCode? }  → { ok }
app.post("/api/auth/unlock", (req, res) => {
  const { masterPassword, totpCode } = req.body;
  if (!masterPassword) return res.status(400).json({ error: "masterPassword required" });
  const result = auth.unlock(masterPassword, totpCode);
  if (!result.ok) return res.status(401).json(result);
  res.json(result);
});

// POST /api/auth/lock
app.post("/api/auth/lock", (_req, res) => {
  auth.lock();
  res.json({ ok: true });
});

// POST /api/auth/recover  { recoveryKey, newMasterPassword }  → { ok }
app.post("/api/auth/recover", (req, res) => {
  const { recoveryKey, newMasterPassword } = req.body;
  if (!recoveryKey || !newMasterPassword)
    return res.status(400).json({ error: "recoveryKey and newMasterPassword required" });
  const result = auth.recover(recoveryKey, newMasterPassword);
  if (!result.ok) return res.status(401).json(result);
  res.json(result);
});

// POST /api/auth/totp/setup  → { secret, uri }  (vault must be unlocked)
app.post("/api/auth/totp/setup", requireUnlocked, (_req, res) => {
  const result = auth.setupTotp();
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// POST /api/auth/totp/confirm  { secret, code }  → { ok }
app.post("/api/auth/totp/confirm", requireUnlocked, (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) return res.status(400).json({ error: "secret and code required" });
  const result = auth.confirmTotp(secret, String(code));
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// POST /api/auth/totp/disable  { code }  → { ok }
app.post("/api/auth/totp/disable", requireUnlocked, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "TOTP code required" });
  const result = auth.disableTotp(String(code));
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// ── Accounts ──────────────────────────────────────────────────────────────────

app.get("/api/accounts", requireUnlocked, (req, res) => {
  res.json(readDB().map(sanitize));
});

// ── Batch refresh all accounts ─────────────────────────────────────────────
// Must be before /:id so Express doesn't treat "refresh-all" as an id.

app.post("/api/accounts/refresh-all", requireUnlocked, async (_req, res) => {
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
  let gameCursor = 0;
  async function gameWorker() {
    while (gameCursor < withId.length) {
      const acc = withId[gameCursor++];
      const g = await fetchGameData(acc.steamId64);
      if (g) gameMap[acc.steamId64] = g;
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, withId.length) }, gameWorker));

  // Leetify has no batch endpoint — run 2 at a time to avoid rate limiting
  const leetifyMap = {};
  let leetifyCursor = 0;
  async function leetifyWorker() {
    while (leetifyCursor < withId.length) {
      const acc = withId[leetifyCursor++];
      const profile = await fetchLeetifyProfile(acc.steamId64);
      if (profile?.found) {
        leetifyMap[acc.steamId64] = {
          premierRank:   profile.premierRank,
          hsPct:         profile.hsPct,
          winRate:       profile.winRate,
          leetifyRating: profile.leetifyRating,
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, withId.length) }, leetifyWorker));

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
      ...(leetifyMap[acc.steamId64] && {
        ...(leetifyMap[acc.steamId64].premierRank   != null && { leetifyPremierRating: leetifyMap[acc.steamId64].premierRank   }),
        ...(leetifyMap[acc.steamId64].winRate        != null && { leetifyWinRate:       leetifyMap[acc.steamId64].winRate        }),
        ...(leetifyMap[acc.steamId64].leetifyRating  != null && { leetifyRating:        leetifyMap[acc.steamId64].leetifyRating  }),
      }),
    };
  }

  writeDB(accounts);
  res.json(accounts.map(sanitize));
});

app.post("/api/accounts", requireUnlocked, async (req, res) => {
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

// GET /api/accounts/export — password-free export (backwards compat)
app.get("/api/accounts/export", requireUnlocked, (_req, res) => {
  const accounts = readDB().map(sanitize); // strips passwords
  res.setHeader("Content-Disposition", `attachment; filename="steam-manager-export-${new Date().toISOString().slice(0,10)}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(accounts, null, 2));
});

// POST /api/accounts/export-secure  { passphrase }
// Returns a JSON blob with passwords preserved, vault key wrapped under passphrase.
app.post("/api/accounts/export-secure", requireUnlocked, (req, res) => {
  const { passphrase } = req.body;
  if (!passphrase) return res.status(400).json({ error: "passphrase required" });

  const wrapped = auth.wrapKeyForExport(passphrase);
  if (!wrapped.ok) return res.status(400).json({ error: wrapped.error });

  // Include raw (still-encrypted) password and sharedSecret fields — they stay
  // encrypted with the vault key and will be re-keyed on import.
  const accounts = readDB().map(({ password, sharedSecret, ...rest }) => ({
    ...rest,
    ...(password     && { password }),
    ...(sharedSecret && { sharedSecret }),
  }));

  res.json({
    version:      2,
    exportedAt:   new Date().toISOString(),
    exportSalt:   wrapped.exportSalt,
    vaultKeyEnc:  wrapped.vaultKeyEnc,
    accounts,
  });
});

// POST /api/accounts/import
// Accepts either:
//   - a plain array (legacy export, no passwords)
//   - { version: 2, exportSalt, vaultKeyEnc, accounts, passphrase } (secure export)
app.post("/api/accounts/import", requireUnlocked, (req, res) => {
  const body = req.body;

  // ── secure export (v2) ────────────────────────────────────────────────────
  if (body && body.version === 2) {
    const { passphrase, exportSalt, vaultKeyEnc, accounts: incoming } = body;
    if (!passphrase) return res.status(400).json({ error: "passphrase required for secure import" });
    if (!Array.isArray(incoming)) return res.status(400).json({ error: "invalid export file" });

    // Recover the export vault key
    let exportKey;
    try {
      exportKey = auth.unwrapExportKey(passphrase, exportSalt, vaultKeyEnc);
    } catch {
      return res.status(401).json({ error: "Wrong passphrase" });
    }

    const currentKey = auth.getVaultKey();
    if (!currentKey) return res.status(401).json({ error: "Vault is locked" });

    const existing    = readDB();
    const existingIds = new Set(existing.map(a => a.id));
    let added = 0;

    for (const acc of incoming) {
      if (!acc.name) continue;
      if (existingIds.has(acc.id)) continue;

      // Re-encrypt password from export key → current vault key
      let password = null;
      if (acc.password && acc.password.startsWith(ENC_PREFIX)) {
        try {
          const plain = decryptWithKey(acc.password, exportKey);
          password = encryptWithKey(plain, currentKey);
        } catch {
          password = null; // corrupted — drop it rather than crash
        }
      }

      existing.push({ ...acc, id: acc.id || uuidv4(), password });
      added++;
    }

    writeDB(existing);
    return res.json({ added, total: existing.length });
  }

  // ── legacy export (plain array, no passwords) ─────────────────────────────
  const incoming = Array.isArray(body) ? body : null;
  if (!incoming) return res.status(400).json({ error: "Expected an array or a secure export object" });

  const existing    = readDB();
  const existingIds = new Set(existing.map(a => a.id));
  let added = 0;
  for (const acc of incoming) {
    if (!acc.name) continue;
    if (existingIds.has(acc.id)) continue;
    existing.push({ ...acc, id: acc.id || uuidv4(), password: null });
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

app.patch("/api/accounts/:id", requireUnlocked, async (req, res) => {
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

app.get("/api/accounts/:id/password", requireUnlocked, (req, res) => {
  const account = readDB().find(a => a.id === req.params.id);
  if (!account)          return res.status(404).json({ error: "not found" });
  if (!account.password) return res.status(404).json({ error: "no password saved" });
  const plain = decryptPassword(account.password);
  if (!plain) return res.status(500).json({ error: "failed to decrypt" });
  res.json({ password: plain });
});

app.delete("/api/accounts/:id", requireUnlocked, (req, res) => {
  const accounts = readDB();
  const filtered = accounts.filter(a => a.id !== req.params.id);
  if (filtered.length === accounts.length) return res.status(404).json({ error: "not found" });
  writeDB(filtered);
  res.json({ ok: true });
});

// ── Account switching ─────────────────────────────────────────────────────────

let switchQueue = Promise.resolve();

app.post("/api/switch/:id", requireUnlocked, (req, res) => {
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

// ── Steam shutdown ────────────────────────────────────────────────────────────

app.post("/api/steam/shutdown", requireUnlocked, async (_req, res) => {
  try {
    const steamInfo  = await getSteamPath();
    const wasRunning = await killSteam(steamInfo?.exe);
    res.json({ ok: true, wasRunning });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Shortcuts ─────────────────────────────────────────────────────────────────

app.get("/api/shortcuts", (_req, res) => res.json(readShortcuts()));

app.post("/api/shortcuts", (req, res) => {
  const { name, path: exePath, args } = req.body;
  if (!name || !exePath) return res.status(400).json({ error: "name and path are required" });
  const shortcuts = readShortcuts();
  const entry = { id: uuidv4(), name, path: exePath, args: args || "", createdAt: new Date().toISOString() };
  shortcuts.push(entry);
  writeShortcuts(shortcuts);
  res.status(201).json(entry);
});

app.patch("/api/shortcuts/:id", (req, res) => {
  const shortcuts = readShortcuts();
  const idx = shortcuts.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const allowed = ["name", "path", "args"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  shortcuts[idx] = { ...shortcuts[idx], ...updates };
  writeShortcuts(shortcuts);
  res.json(shortcuts[idx]);
});

app.delete("/api/shortcuts/:id", (req, res) => {
  const shortcuts = readShortcuts();
  const filtered  = shortcuts.filter(s => s.id !== req.params.id);
  if (filtered.length === shortcuts.length) return res.status(404).json({ error: "not found" });
  writeShortcuts(filtered);
  res.json({ ok: true });
});

app.put("/api/shortcuts/order", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });
  const shortcuts = readShortcuts();
  const ordered   = ids.map(id => shortcuts.find(s => s.id === id)).filter(Boolean);
  writeShortcuts(ordered);
  res.json({ ok: true });
});

app.post("/api/shortcuts/:id/launch", (req, res) => {
  const shortcuts = readShortcuts();
  const entry     = shortcuts.find(s => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "not found" });
  try {
    if (process.platform === "win32") {
      // Route through the Windows shell so UAC elevation and shell-execute work.
      // The empty "" after 'start' is the required window title when the path is quoted.
      const safePath = entry.path.replace(/"/g, "");
      const argsStr  = entry.args ? ` ${entry.args}` : "";
      exec(`start "" "${safePath}"${argsStr}`, (err) => {
        if (err) console.error(`[shortcuts] launch error: ${err.message}`);
      });
    } else {
      const argsArray = entry.args ? entry.args.trim().split(/\s+/) : [];
      const child = spawn(entry.path, argsArray, { detached: true, stdio: "ignore" });
      child.on("error", e => console.error(`[shortcuts] launch error: ${e.message}`));
      child.unref();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// ── Patch Notes ───────────────────────────────────────────────────────────────

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
    }).on("error", reject);
  });
}

app.get("/api/patch-notes/tracked", (_req, res) => {
  const config = readConfig();
  res.json(config.trackedGames || []);
});

app.post("/api/patch-notes/tracked", (req, res) => {
  const { appid, name, icon } = req.body;
  if (!appid || !name) return res.status(400).json({ error: "appid and name required" });
  const config = readConfig();
  const games  = config.trackedGames || [];
  if (!games.find(g => g.appid === appid)) {
    games.push({ appid, name, icon: icon || null });
    writeConfig({ ...config, trackedGames: games });
  }
  res.json(games);
});

app.delete("/api/patch-notes/tracked/:appid", (req, res) => {
  const appid  = parseInt(req.params.appid, 10);
  const config = readConfig();
  const games  = (config.trackedGames || []).filter(g => g.appid !== appid);
  writeConfig({ ...config, trackedGames: games });
  res.json(games);
});

app.get("/api/patch-notes/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ items: [] });
  try {
    const data = await httpsGetJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`);
    res.json({ items: (data.items || []).map(i => ({ id: i.id, name: i.name, tiny_image: i.tiny_image })) });
  } catch { res.json({ items: [] }); }
});

app.get("/api/patch-notes/news/:appid", async (req, res) => {
  const appid = parseInt(req.params.appid, 10);
  if (!appid) return res.status(400).json({ items: [] });
  try {
    const data  = await httpsGetJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=15&maxlength=1200&format=json`);
    const items = (data.appnews?.newsitems || []).map(n => ({
      gid: n.gid, title: n.title, url: n.url,
      contents: n.contents, feedlabel: n.feedlabel,
      date: n.date, author: n.author,
    }));
    res.json({ items });
  } catch { res.json({ items: [] }); }
});

const PATCH_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function checkPatchNotes() {
  const config = readConfig();
  const games  = config.trackedGames || [];
  if (!games.length) return;

  const lastSeen = { ...(config.patchNotesLastSeen || {}) };
  let changed = false;

  for (const game of games) {
    try {
      const data   = await httpsGetJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${game.appid}&count=1&maxlength=300&format=json`);
      const latest = data.appnews?.newsitems?.[0];
      if (!latest) continue;

      const prev = lastSeen[game.appid];
      if (!prev) {
        // First time seeing this game — record baseline, don't notify
        lastSeen[game.appid] = latest.gid;
        changed = true;
        continue;
      }
      if (latest.gid !== prev) {
        addPatchNoteNotification({ gameName: game.name, appid: game.appid, title: latest.title, url: latest.url, gid: latest.gid });
        lastSeen[game.appid] = latest.gid;
        changed = true;
        console.log(`[patch-notes] new update for ${game.name}: ${latest.title}`);
      }
    } catch (e) {
      console.error(`[patch-notes] check failed for ${game.name}:`, e.message);
    }
  }

  if (changed) writeConfig({ ...readConfig(), patchNotesLastSeen: lastSeen });
}

function startPatchNotesInterval() {
  setTimeout(checkPatchNotes, 2 * 60 * 1000);
  setInterval(checkPatchNotes, PATCH_CHECK_INTERVAL_MS);
  console.log("[patch-notes] auto-check every 30min");
}

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
    startPatchNotesInterval();
    resolve();
  }));
}

if (require.main === module) {
  startServer().then(() => console.log(`API running on http://localhost:${PORT}`));
}

module.exports = { app, startServer, setSteamAutoLogin, encryptPassword, decryptPassword };
