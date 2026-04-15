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

// Returns true if Steam was running and was killed, false if it was already dead.
function killSteam(steamPath) {
  return new Promise((resolve) => {
    exec('tasklist /NH', (_err, stdout) => {
      const out     = (stdout || "").toLowerCase();
      const running = out.includes("steam.exe") ||
                      out.includes("steamwebhelper.exe") ||
                      out.includes("steamservice.exe");

      if (!running) {
        dbg("[killSteam] Steam not running, skipping shutdown");
        return resolve(false);
      }

      function doKill(exePath) {
        if (exePath) exec(`"${exePath}" -shutdown`);

        let attempts = 0;
        const interval = setInterval(() => {
          exec('tasklist /NH', (_err2, stdout2) => {
            const out2 = (stdout2 || "").toLowerCase();
            const dead = !out2.includes("steam.exe") &&
                         !out2.includes("steamwebhelper.exe") &&
                         !out2.includes("steamservice.exe");
            if (dead) {
              dbg(`[killSteam] all Steam processes gone after ${attempts * 500}ms`);
              clearInterval(interval);
              resolve(true);
            } else if (++attempts >= 60) {
              dbg(`[killSteam] graceful shutdown timed out, force killing`);
              exec(
                "taskkill /F /T /IM steam.exe & taskkill /F /IM steamwebhelper.exe & taskkill /F /IM SteamService.exe",
                () => { clearInterval(interval); resolve(true); }
              );
            }
          });
        }, 500);
      }

      if (steamPath) {
        doKill(steamPath);
      } else {
        getSteamPath().then(doKill);
      }
    });
  });
}

// ── Minimal VDF tokenizer ─────────────────────────────────────────────────────
// Parses Valve's KeyValues format into a plain JS object tree.
// Handles quoted strings, nested braces, // line comments, whitespace variants.

function vdfParse(text) {
  let i = 0;
  function skipWs() {
    while (i < text.length) {
      if (text[i] === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; }
      else if (text[i] === " " || text[i] === "\t" || text[i] === "\r" || text[i] === "\n") i++;
      else break;
    }
  }
  function readString() {
    i++; // skip opening "
    let s = "";
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && i + 1 < text.length) { i++; s += text[i++]; }
      else s += text[i++];
    }
    i++; // skip closing "
    return s;
  }
  function readNode() {
    const obj = {};
    skipWs();
    while (i < text.length && text[i] !== "}") {
      skipWs();
      if (i >= text.length || text[i] === "}") break;
      const key = readString();
      skipWs();
      if (text[i] === "{") { i++; obj[key] = readNode(); skipWs(); i++; } // skip }
      else                  { obj[key] = readString(); }
      skipWs();
    }
    return obj;
  }
  skipWs();
  // Top-level: one or more key { ... } blocks
  const root = {};
  while (i < text.length) {
    skipWs();
    if (i >= text.length) break;
    const key = readString();
    skipWs();
    i++; // skip {
    root[key] = readNode();
    skipWs();
    i++; // skip }
    skipWs();
  }
  return root;
}

function vdfStringify(obj, depth = 0) {
  const indent = "\t".repeat(depth);
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object") {
      lines.push(`${indent}"${k}"\n${indent}{`);
      lines.push(vdfStringify(v, depth + 1));
      lines.push(`${indent}}`);
    } else {
      lines.push(`${indent}"${k}"\t\t"${v}"`);
    }
  }
  return lines.join("\n");
}

// Update loginusers.vdf so Steam auto-logins as the target account on next launch.
function setSteamAutoLogin(steamDir, steamId64) {
  const loginUsersPath = path.join(steamDir, "config", "loginusers.vdf");
  if (!fs.existsSync(loginUsersPath)) return false;
  const raw = fs.readFileSync(loginUsersPath, "utf8");
  if (!raw.includes(steamId64)) return false;

  let tree;
  try { tree = vdfParse(raw); } catch (e) { console.error("[vdf] parse error:", e.message); return false; }

  const users = tree["users"] || tree["Users"] || Object.values(tree)[0];
  if (!users || typeof users !== "object") return false;

  for (const [id, data] of Object.entries(users)) {
    if (id === steamId64) {
      data["MostRecent"]      = "1";
      data["RememberPassword"] = "1";
      data["AllowAutoLogin"]  = "1";
    } else {
      data["MostRecent"]      = "0";
      data["AllowAutoLogin"]  = "0";
      data["RememberPassword"] = "0";
    }
  }

  const topKey = Object.keys(tree).find(k =>
    tree[k] === users || Object.values(tree).indexOf(users) === Object.keys(tree).indexOf(k)
  ) || "users";
  const out = `"${topKey}"\n{\n${vdfStringify(users, 1)}\n}\n`;
  fs.writeFileSync(loginUsersPath, out);
  return true;
}

// ── Leetify ───────────────────────────────────────────────────────────────────

function fetchLeetifyProfile(steamId64) {
  return new Promise((resolve) => {
    const { leetifyApiKey } = readConfig();
    if (!leetifyApiKey || !steamId64) return resolve(null);
    const url = `https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${steamId64}`;
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Authorization": `Bearer ${leetifyApiKey}` },
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 404 || res.statusCode === 403) return resolve({ found: false });
        if (res.statusCode !== 200) { console.log(`[leetify] unexpected status ${res.statusCode}`); return resolve(null); }
        try {
          const p = JSON.parse(data);
          const rating = p.rating || {};
          const stats  = p.stats  || {};

          // aim/positioning/utility are 0–100 percentile scores (already correct)
          // ct_leetify/t_leetify/clutch/opening are tiny decimals — multiply ×100 to get
          // the same "+3.82 / +2.56 / +11.87 / +1.84" values Leetify shows in their UI
          const aimR  = rating.aim         ?? null;
          const posR  = rating.positioning ?? null;
          const utilR = rating.utility     ?? null;

          const ctR      = rating.ct_leetify != null ? rating.ct_leetify * 100 : null;
          const tR       = rating.t_leetify  != null ? rating.t_leetify  * 100 : null;
          const clutchR  = rating.clutch     != null ? rating.clutch     * 100 : null;
          const openingR = rating.opening    != null ? rating.opening    * 100 : null;

          // Overall Leetify Rating = average of CT and T (matches what Leetify displays)
          const overallRating = ctR != null && tR != null
            ? parseFloat(((ctR + tR) / 2).toFixed(2))
            : null;

          resolve({
            found: true,
            name:           p.name             ?? null,
            leetifyRating:  overallRating,
            ctRating:       ctR,
            tRating:        tR,
            aimRating:      aimR,
            posRating:      posR,
            utilityRating:  utilR,
            clutchRating:   clutchR,
            openingRating:  openingR,
            winRate:        p.winrate != null
              ? (p.winrate > 1 ? p.winrate.toFixed(1) : (p.winrate * 100).toFixed(1))
              : null,
            totalMatches:   p.total_matches     ?? null,
            hsPct:          stats.accuracy_head != null
              ? (stats.accuracy_head > 1
                  ? stats.accuracy_head.toFixed(1)
                  : (stats.accuracy_head * 100).toFixed(1))
              : null,
            reactionMs:     stats.reaction_time_ms != null ? Math.round(stats.reaction_time_ms) : null,
            premierRank:    p.ranks?.premier?.rank_value ?? null,
            recentMatches:  (p.recent_matches || []).slice(0, 8).map(m => ({
              id:           m.id,
              map:          m.map_name   ?? "Unknown",
              outcome:      m.outcome    ?? null,
              rating:       m.leetify_rating != null ? m.leetify_rating * 100 : null,
              finishedAt:   m.finished_at    ?? null,
              score:        Array.isArray(m.score) ? m.score : null,
            })),
          });
        } catch (e) { console.log(`[leetify] parse error: ${e.message}`); resolve(null); }
      });
    });
    req.on("error", (e) => { console.log(`[leetify] error: ${e.message}`); resolve(null); });
    req.setTimeout(10000, () => { console.log(`[leetify] timeout`); req.destroy(); resolve(null); });
  });
}

// ── CS2 stats ─────────────────────────────────────────────────────────────────

function fetchCS2Stats(steamId64) {
  return new Promise((resolve) => {
    const { steamApiKey } = readConfig();
    if (!steamApiKey || !steamId64) return resolve(null);
    const url = `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=730&key=${steamApiKey}&steamid=${steamId64}`;
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 403) return resolve({ private: true });
        if (res.statusCode !== 200) { console.log(`[cs2stats] ${res.statusCode}`); return resolve(null); }
        try {
          const raw = JSON.parse(data)?.playerstats?.stats ?? [];
          const s = {};
          for (const { name, value } of raw) s[name] = value;

          const kills   = s.total_kills          || 0;
          const deaths  = s.total_deaths         || 0;
          const matches = s.total_matches_played || 0;
          const mWins   = s.total_matches_won    || 0;
          const rWins   = s.total_wins           || 0;
          const rounds  = s.total_rounds_played  || 0;
          const hs      = s.total_headshot_kills || 0;
          const fired   = s.total_shots_fired    || 0;
          const hit     = s.total_shots_hit      || 0;

          resolve({
            kd:          deaths  > 0 ? (kills  / deaths).toFixed(2)  : kills > 0 ? "∞" : "0.00",
            matchWinPct: matches > 0 ? ((mWins  / matches) * 100).toFixed(1) : null,
            roundWinPct: rounds  > 0 ? ((rWins  / rounds)  * 100).toFixed(1) : null,
            hsPct:       kills   > 0 ? ((hs     / kills)   * 100).toFixed(1) : null,
            accuracy:    fired   > 0 ? ((hit    / fired)   * 100).toFixed(1) : null,
            totalKills:   kills,
            totalDeaths:  deaths,
            totalMatches: matches,
            totalWins:    mWins,
            totalRounds:  rounds,
            totalMVPs:    s.total_mvps || 0,
            timePlayed:   Math.round((s.total_time_played || 0) / 3600),
            lastMatch: {
              kills:  s.last_match_kills   || 0,
              deaths: s.last_match_deaths  || 0,
              damage: s.last_match_damage  || 0,
              hs:     s.last_match_hs_kills || 0,
              wins:   s.last_match_wins    || 0,
              rounds: s.last_match_rounds  || 0,
              mvps:   s.last_match_mvps    || 0,
            },
          });
        } catch (e) { console.log(`[cs2stats] parse error: ${e.message}`); resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

// ── Batch Steam API helpers ───────────────────────────────────────────────────
// Both endpoints accept up to 100 steamIds per call.

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function fetchBanDataBatch(steamId64s) {
  const { steamApiKey } = readConfig();
  if (!steamApiKey || !steamId64s.length) return Promise.resolve({});
  return Promise.all(
    chunkArray(steamId64s, 100).map(chunk => new Promise((resolve) => {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${steamApiKey}&steamids=${chunk.join(",")}`;
      https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve({});
          try {
            const result = {};
            for (const p of JSON.parse(data)?.players ?? [])
              result[p.SteamId] = { vacBanned: p.VACBanned, gameBans: p.NumberOfGameBans, daysSinceLastBan: p.DaysSinceLastBan };
            resolve(result);
          } catch { resolve({}); }
        });
      }).on("error", () => resolve({}));
    }))
  ).then(results => Object.assign({}, ...results));
}

function fetchPlayerSummariesBatch(steamId64s) {
  const { steamApiKey } = readConfig();
  if (!steamApiKey || !steamId64s.length) return Promise.resolve({});
  return Promise.all(
    chunkArray(steamId64s, 100).map(chunk => new Promise((resolve) => {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${chunk.join(",")}`;
      https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve({});
          try {
            const result = {};
            for (const p of JSON.parse(data)?.response?.players ?? [])
              result[p.steamid] = { avatar: p.avatarmedium, profileName: p.personaname };
            resolve(result);
          } catch { resolve({}); }
        });
      }).on("error", () => resolve({}));
    }))
  ).then(results => Object.assign({}, ...results));
}

module.exports = { fetchSteamProfile, fetchBanData, fetchBanDataBatch, fetchPlayerSummariesBatch, fetchGameData, fetchSteamFields, fetchCS2Stats, fetchLeetifyProfile, getSteamPath, killSteam, setSteamAutoLogin };
