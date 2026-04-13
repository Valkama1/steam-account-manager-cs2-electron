const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { exec, spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

// ── Debug logging ─────────────────────────────────────────────────────────────
// Set DEBUG=1 in the environment to enable verbose logging.
// e.g.  DEBUG=1 npm run dev   or   DEBUG=1 npm run electron:dev

const DEBUG = process.env.DEBUG === "1";
const dbg = (...args) => { if (DEBUG) console.log(...args); };

// ── Encryption ────────────────────────────────────────────────────────────────

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


// ── Steam profile fetch ───────────────────────────────────────────────────────

function fetchSteamProfile(profileUrl) {
  return new Promise((resolve) => {
    let url = profileUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    url = url.replace(/\/+$/, "") + "/?xml=1";

    function doGet(url, hops) {
      if (hops <= 0) { console.log("[steam] too many redirects"); return resolve(null); }
      console.log(`[steam] fetching: ${url}`);
      const mod = url.startsWith("https://") ? https : http;
      mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        console.log(`[steam] status: ${res.statusCode}`);
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          console.log(`[steam] redirect -> ${res.headers.location}`);
          res.resume();
          return doGet(res.headers.location, hops - 1);
        }
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          console.log(`[steam] response length: ${data.length}, preview: ${data.slice(0, 200)}`);
          const cdata = (tag) => { const m = data.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`)); return m ? m[1] : null; };
          const plain = (tag) => { const m = data.match(new RegExp(`<${tag}>(\\d+)<\\/${tag}>`)); return m ? m[1] : null; };
          const result = {
            avatar:      cdata("avatarMedium"),
            steamId64:   plain("steamID64"),
            profileName: cdata("steamID"),
          };
          console.log("[steam] parsed:", result);
          resolve(result);
        });
      }).on("error", (e) => { console.log(`[steam] error: ${e.message}`); resolve(null); });
    }

    doGet(url, 5);
  });
}

// ── Config helpers ────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(DATA_DIR, "config.json");

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({ steamApiKey: "" }, null, 2));
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ── Steam ban fetch ───────────────────────────────────────────────────────────

function fetchBanData(steamId64) {
  return new Promise((resolve) => {
    const { steamApiKey } = readConfig();
    if (!steamApiKey || !steamId64) return resolve(null);
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${steamApiKey}&steamids=${steamId64}`;
    console.log(`[bans] fetching for ${steamId64}`);
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          console.log(`[bans] ${res.statusCode}`);
          return resolve(null);
        }
        try {
          const player = JSON.parse(data)?.players?.[0];
          if (!player) return resolve(null);
          const result = {
            vacBanned:        player.VACBanned,
            gameBans:         player.NumberOfGameBans,
            daysSinceLastBan: player.DaysSinceLastBan,
          };
          console.log(`[bans] result:`, result);
          resolve(result);
        } catch (e) {
          console.log(`[bans] parse error: ${e.message}`);
          resolve(null);
        }
      });
    }).on("error", (e) => { console.log(`[bans] error: ${e.message}`); resolve(null); });
  });
}

// ── Steam game data fetch (CS2 hours + last played) ──────────────────────────

function fetchGameData(steamId64) {
  return new Promise((resolve) => {
    const { steamApiKey } = readConfig();
    if (!steamApiKey || !steamId64) return resolve(null);
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${steamId64}&include_played_free_games=1&format=json`;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) { console.log(`[games] ${res.statusCode}`); return resolve(null); }
        try {
          const games = JSON.parse(data)?.response?.games ?? [];
          const cs2 = games.find(g => g.appid === 730);
          if (!cs2) return resolve(null);
          resolve({
            cs2Hours:     Math.round((cs2.playtime_forever || 0) / 60),
            cs2LastPlayed: cs2.rtime_last_played || null,
          });
        } catch (e) { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

// ── Steam data fetch (profile + bans + game hours) ───────────────────────────

async function fetchSteamFields(profileUrl) {
  const steam = profileUrl ? await fetchSteamProfile(profileUrl) : null;
  const [bans, games] = steam?.steamId64
    ? await Promise.all([fetchBanData(steam.steamId64), fetchGameData(steam.steamId64)])
    : [null, null];
  return {
    avatar:           steam?.avatar      || null,
    steamId64:        steam?.steamId64   || null,
    profileName:      steam?.profileName || null,
    vacBanned:        bans?.vacBanned        ?? null,
    gameBans:         bans?.gameBans         ?? null,
    daysSinceLastBan: bans?.daysSinceLastBan ?? null,
    cs2Hours:         games?.cs2Hours        ?? null,
    cs2LastPlayed:    games?.cs2LastPlayed   ?? null,
  };
}

// ── Steam Guard TOTP ──────────────────────────────────────────────────────────

function generateSteamGuardCode(sharedSecret) {
  const key      = Buffer.from(sharedSecret, "base64");
  const time     = Math.floor(Date.now() / 1000 / 30);
  const timeBuf  = Buffer.alloc(8);
  timeBuf.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  timeBuf.writeUInt32BE(time >>> 0, 4);
  const hash     = crypto.createHmac("sha1", key).update(timeBuf).digest();
  const offset   = hash[19] & 0x0f;
  const fullCode = ((hash[offset] & 0x7f) << 24) |
                   ((hash[offset + 1] & 0xff) << 16) |
                   ((hash[offset + 2] & 0xff) << 8) |
                    (hash[offset + 3] & 0xff);
  const alphabet = "23456789BCDFGHJKMNPQRTVWXY";
  let code = "";
  let n = fullCode;
  for (let i = 0; i < 5; i++) {
    code = alphabet[n % 26] + code;
    n = Math.floor(n / 26);
  }
  return code;
}

// ── Steam client control ──────────────────────────────────────────────────────

function getSteamPath() {
  return new Promise((resolve) => {
    exec('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath', (err, stdout) => {
      if (!err && stdout) {
        const match = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/);
        if (match) {
          const exePath = path.join(match[1].trim(), "steam.exe");
          if (fs.existsSync(exePath)) return resolve(exePath);
        }
      }
      const fallback = "C:\\Program Files (x86)\\Steam\\steam.exe";
      resolve(fs.existsSync(fallback) ? fallback : null);
    });
  });
}

function killSteam() {
  return new Promise((resolve) => {
    getSteamPath().then((steamPath) => {
      if (steamPath) {
        exec(`"${steamPath}" -shutdown`);
      }

      // Poll until steam.exe + steamwebhelper.exe + SteamService.exe are all gone (up to 30 s).
      // SteamService.exe must also be dead — if it's still running, a new steam.exe will detect
      // it via IPC, forward args to it, and exit immediately (code=0) without actually logging in.
      let attempts = 0;
      const interval = setInterval(() => {
        exec(
          'tasklist /NH',
          (_err, stdout) => {
            const out = (stdout || "").toLowerCase();
            const dead = !out.includes("steam.exe") &&
                         !out.includes("steamwebhelper.exe") &&
                         !out.includes("steamservice.exe");
            if (dead) {
              dbg(`[killSteam] all Steam processes gone after ${attempts * 500}ms`);
              clearInterval(interval);
              resolve();
            } else if (++attempts >= 60) {
              dbg(`[killSteam] graceful shutdown timed out, force killing`);
              exec(
                "taskkill /F /T /IM steam.exe & taskkill /F /IM steamwebhelper.exe & taskkill /F /IM SteamService.exe",
                () => { clearInterval(interval); resolve(); }
              );
            }
          }
        );
      }, 500);
    });
  });
}

// Update loginusers.vdf so Steam auto-logins as the target account on next launch.
// Sets AllowAutoLogin=1 + RememberPassword=1 for target; clears them for all others.
function setSteamAutoLogin(steamDir, steamId64) {
  const loginUsersPath = path.join(steamDir, "config", "loginusers.vdf");
  if (!fs.existsSync(loginUsersPath)) return false;
  let users = fs.readFileSync(loginUsersPath, "utf8");
  if (!users.includes(steamId64)) return false;

  const ws = "[\\t ]+";

  // Clear AllowAutoLogin + RememberPassword on ALL accounts first
  users = users.replace(new RegExp(`"MostRecent"${ws}"[01]"`, "g"),      '"MostRecent"\t\t"0"');
  users = users.replace(new RegExp(`"AllowAutoLogin"${ws}"[01]"`, "g"),   '"AllowAutoLogin"\t\t"0"');
  users = users.replace(new RegExp(`"RememberPassword"${ws}"[01]"`, "g"), '"RememberPassword"\t\t"0"');

  // Patch the target account's block
  const idIdx = users.indexOf(`"${steamId64}"`);
  const braceOpen = users.indexOf("{", idIdx);
  let depth = 0, braceClose = braceOpen;
  for (let i = braceOpen; i < users.length; i++) {
    if (users[i] === "{") depth++;
    else if (users[i] === "}") { if (--depth === 0) { braceClose = i; break; } }
  }
  let block = users.slice(braceOpen, braceClose + 1);
  block = block.replace(new RegExp(`"MostRecent"${ws}"[01]"`),      '"MostRecent"\t\t"1"');
  block = block.replace(new RegExp(`"RememberPassword"${ws}"[01]"`), '"RememberPassword"\t\t"1"');
  if (block.match(new RegExp(`"AllowAutoLogin"${ws}"[01]"`))) {
    block = block.replace(new RegExp(`"AllowAutoLogin"${ws}"[01]"`), '"AllowAutoLogin"\t\t"1"');
  } else {
    block = block.replace(/(\{)/, '$1\n\t\t"AllowAutoLogin"\t\t"1"');
  }
  users = users.slice(0, braceOpen) + block + users.slice(braceClose + 1);
  fs.writeFileSync(loginUsersPath, users);
  return true;
}


// ── DB helpers ────────────────────────────────────────────────────────────────

const app = express();
const PORT = 3001;
const DB_PATH = process.env.TEST_DB_PATH || path.join(DATA_DIR, "accounts.json");

app.use(cors());
app.use(express.json());

function readDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]");
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Encrypt any plain-text passwords left in the DB from before this feature was added
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

migratePasswords();

// Strip password before sending to client, but expose hasPassword flag
function sanitize(account) {
  const { password, ...rest } = account;
  return { ...rest, hasPassword: !!password };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET all accounts (passwords stripped)
app.get("/api/accounts", (req, res) => {
  res.json(readDB().map(sanitize));
});

// POST new account
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

// PATCH update account
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

// DELETE account
app.delete("/api/accounts/:id", (req, res) => {
  const accounts = readDB();
  const filtered = accounts.filter(a => a.id !== req.params.id);
  if (filtered.length === accounts.length) return res.status(404).json({ error: "not found" });
  writeDB(filtered);
  res.json({ ok: true });
});

// POST switch to account — relaunch Steam as the target account
// Only one switch can run at a time; subsequent requests wait in a queue.
let switchQueue = Promise.resolve();

app.post("/api/switch/:id", (req, res) => {
  switchQueue = switchQueue.then(() => doSwitch(req, res));
});

async function doSwitch(req, res) {
  const accounts = readDB();
  const account = accounts.find(a => a.id === req.params.id);
  if (!account) return res.status(404).json({ error: "not found" });

  const username  = account.name.toLowerCase();
  const steamPath = await getSteamPath();
  if (!steamPath) return res.status(500).json({ error: "Steam executable not found" });
  const steamDir  = path.dirname(steamPath);

  // ── Fast path (preferred) ────────────────────────────────────────────────────
  // Uses stored session tokens from loginusers.vdf — no password or 2FA needed.
  // Force-kills steam.exe (not SteamService) so the service resets its active
  // session and auto-logins to the registry AutoLoginUser on next launch.
  const loginUsersPath = path.join(steamDir, "config", "loginusers.vdf");
  const inVdf = account.steamId64 &&
                fs.existsSync(loginUsersPath) &&
                fs.readFileSync(loginUsersPath, "utf8").includes(account.steamId64);

  if (inVdf) {
    dbg(`[switch] fast-path → ${username} (steamId64=${account.steamId64})`);
    await killSteam(true);
    dbg(`[switch] Steam down, waiting 1500ms`);
    await new Promise(r => setTimeout(r, 1500));
    const vdfOk = setSteamAutoLogin(steamDir, account.steamId64);
    dbg(`[switch] setSteamAutoLogin returned ${vdfOk}`);
    await new Promise(r => exec(`reg add "HKCU\\SOFTWARE\\Valve\\Steam" /v AutoLoginUser /t REG_SZ /d "${username}" /f`, r));
    await new Promise(r => exec(`reg add "HKCU\\SOFTWARE\\Valve\\Steam" /v RememberPassword /t REG_DWORD /d 1 /f`, r));
    dbg(`[switch] registry set, launching Steam`);
    // If a password is stored, use -login so Steam doesn't fall back to the
    // account picker when the cached session token is stale (e.g. after a
    // force-kill that didn't let Steam write a fresh token to loginusers.vdf).
    const fastPassword = account.password ? decryptPassword(account.password) : null;
    const spawnArgs = fastPassword ? ["-login", username, fastPassword] : [];
    const fastChild = spawn(steamPath, spawnArgs, { cwd: steamDir, detached: true, stdio: "ignore", windowsHide: !!fastPassword });
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

  // ── Password path (fallback for first-time login on this machine) ────────────
  // Uses steam.exe -login. Works for accounts without 2FA or with a stored
  // sharedSecret. For Steam Guard via phone, log in manually once first so
  // loginusers.vdf is populated — fast path takes over for all future switches.
  if (!account.password)
    return res.status(400).json({ error: "Account not in loginusers.vdf — log into Steam manually once, then switching will work automatically." });

  const plainPassword = decryptPassword(account.password);
  if (!plainPassword) return res.status(500).json({ error: "Failed to decrypt password" });

  dbg(`[switch] password path → ${username}`);
  await killSteam(true);
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


// GET currently active Steam account
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

// GET / PATCH config
app.get("/api/config", (req, res) => res.json(readConfig()));
app.patch("/api/config", (req, res) => {
  const config = { ...readConfig(), ...req.body };
  writeConfig(config);
  res.json(config);
});

// Serve the built React app (production / Electron). Only activates when
// client/dist exists, so regular `npm run dev` is unaffected.
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

function startServer(port) {
  return new Promise(resolve => app.listen(port || PORT, resolve));
}

if (require.main === module) {
  startServer().then(() => console.log(`API running on http://localhost:${PORT}`));
}

module.exports = { app, startServer, setSteamAutoLogin, encryptPassword, decryptPassword };
