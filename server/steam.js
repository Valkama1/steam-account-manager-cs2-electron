const https              = require("https");
const http               = require("http");
const fs                 = require("fs");
const path               = require("path");
const { exec, spawn }    = require("child_process");
const { readConfig }     = require("./config.js");

const DEBUG = process.env.DEBUG === "1";
const dbg = (...args) => { if (DEBUG) console.log(...args); };

// ── Steam profile scrape ──────────────────────────────────────────────────────

function fetchSteamProfile(profileUrl) {
  return new Promise((resolve) => {
    let url = profileUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    url = url.replace(/\/+$/, "") + "/?xml=1";

    function doGet(url, hops) {
      if (hops <= 0) { console.log("[steam] too many redirects"); return resolve(null); }
      console.log(`[steam] fetching: ${url}`);
      const mod = url.startsWith("https://") ? https : http;
      const req = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
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
          const result = { avatar: cdata("avatarMedium"), steamId64: plain("steamID64"), profileName: cdata("steamID") };
          console.log("[steam] parsed:", result);
          resolve(result);
        });
      });
      req.on("error", (e) => { console.log(`[steam] error: ${e.message}`); resolve(null); });
      req.setTimeout(10000, () => { console.log("[steam] timeout"); req.destroy(); resolve(null); });
    }

    doGet(url, 5);
  });
}

// ── Steam Web API ─────────────────────────────────────────────────────────────

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
        if (res.statusCode !== 200) { console.log(`[bans] ${res.statusCode}`); return resolve(null); }
        try {
          const player = JSON.parse(data)?.players?.[0];
          if (!player) return resolve(null);
          const result = { vacBanned: player.VACBanned, gameBans: player.NumberOfGameBans, daysSinceLastBan: player.DaysSinceLastBan };
          console.log(`[bans] result:`, result);
          resolve(result);
        } catch (e) { console.log(`[bans] parse error: ${e.message}`); resolve(null); }
      });
    }).on("error", (e) => { console.log(`[bans] error: ${e.message}`); resolve(null); });
  });
}

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
          resolve({ cs2Hours: Math.round((cs2.playtime_forever || 0) / 60), cs2LastPlayed: cs2.rtime_last_played || null });
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

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
      if (steamPath) exec(`"${steamPath}" -shutdown`);

      let attempts = 0;
      const interval = setInterval(() => {
        exec('tasklist /NH', (_err, stdout) => {
          const out  = (stdout || "").toLowerCase();
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
        });
      }, 500);
    });
  });
}

// Update loginusers.vdf so Steam auto-logins as the target account on next launch.
function setSteamAutoLogin(steamDir, steamId64) {
  const loginUsersPath = path.join(steamDir, "config", "loginusers.vdf");
  if (!fs.existsSync(loginUsersPath)) return false;
  let users = fs.readFileSync(loginUsersPath, "utf8");
  if (!users.includes(steamId64)) return false;

  const ws = "[\\t ]+";
  users = users.replace(new RegExp(`"MostRecent"${ws}"[01]"`, "g"),      '"MostRecent"\t\t"0"');
  users = users.replace(new RegExp(`"AllowAutoLogin"${ws}"[01]"`, "g"),   '"AllowAutoLogin"\t\t"0"');
  users = users.replace(new RegExp(`"RememberPassword"${ws}"[01]"`, "g"), '"RememberPassword"\t\t"0"');

  const idIdx     = users.indexOf(`"${steamId64}"`);
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

// ── Batch Steam API helpers ───────────────────────────────────────────────────
// Both endpoints accept up to 100 steamIds per call.

function fetchBanDataBatch(steamId64s) {
  return new Promise((resolve) => {
    const { steamApiKey } = readConfig();
    if (!steamApiKey || !steamId64s.length) return resolve({});
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${steamApiKey}&steamids=${steamId64s.join(",")}`;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve({});
        try {
          const result = {};
          for (const p of JSON.parse(data)?.players ?? []) {
            result[p.SteamId] = { vacBanned: p.VACBanned, gameBans: p.NumberOfGameBans, daysSinceLastBan: p.DaysSinceLastBan };
          }
          resolve(result);
        } catch { resolve({}); }
      });
    }).on("error", () => resolve({}));
  });
}

function fetchPlayerSummariesBatch(steamId64s) {
  return new Promise((resolve) => {
    const { steamApiKey } = readConfig();
    if (!steamApiKey || !steamId64s.length) return resolve({});
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${steamId64s.join(",")}`;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve({});
        try {
          const result = {};
          for (const p of JSON.parse(data)?.response?.players ?? []) {
            result[p.steamid] = { avatar: p.avatarmedium, profileName: p.personaname };
          }
          resolve(result);
        } catch { resolve({}); }
      });
    }).on("error", () => resolve({}));
  });
}

module.exports = { fetchSteamProfile, fetchBanData, fetchBanDataBatch, fetchPlayerSummariesBatch, fetchGameData, fetchSteamFields, getSteamPath, killSteam, setSteamAutoLogin };
