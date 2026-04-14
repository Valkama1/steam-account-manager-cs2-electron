import { FILTER_COOKIE, SETTINGS_KEY, DEFAULT_SETTINGS, THEME_PRESETS } from "./constants.js";

export function readSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      colors: Object.fromEntries(
        Object.entries(THEME_PRESETS)
          .filter(([, p]) => p.defaults)
          .map(([key, { defaults }]) => [
            key, { ...defaults, ...(parsed.colors?.[key] || {}) },
          ])
      ),
    };
  } catch { return DEFAULT_SETTINGS; }
}

export function readFilterCookie() {
  const entry = document.cookie.split("; ").find(c => c.startsWith(`${FILTER_COOKIE}=`));
  if (!entry) return {};
  try { return JSON.parse(decodeURIComponent(entry.split("=")[1])); }
  catch { return {}; }
}

export function writeFilterCookie(filters) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${FILTER_COOKIE}=${encodeURIComponent(JSON.stringify(filters))}; expires=${expires}; path=/`;
}

export function sortAccounts(list, field, dir) {
  return [...list].sort((a, b) => {
    let av, bv;
    if (field === "name") {
      av = (a.alias || a.profileName || a.name || "").toLowerCase();
      bv = (b.alias || b.profileName || b.name || "").toLowerCase();
    } else if (field === "createdAt") {
      av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    } else if (field === "cs2Hours") {
      av = a.cs2Hours ?? -1;
      bv = b.cs2Hours ?? -1;
    } else if (field === "premierRating") {
      av = a.premierRating ?? -1;
      bv = b.premierRating ?? -1;
    } else if (field === "steamId64") {
      av = a.steamId64 || "";
      bv = b.steamId64 || "";
    } else {
      return 0;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}
