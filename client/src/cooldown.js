export function parseDuration(text) {
  const m = text.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([mhdw])$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = m[2];
  const ms = { m: 60, h: 3600, d: 86400, w: 604800 }[unit] * 1000 * val;
  return new Date(Date.now() + ms).toISOString();
}

export function remainingStr(expiresIso) {
  if (!expiresIso) return null;
  const diff = new Date(expiresIso) - Date.now();
  if (diff <= 0) return "expired";
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || !parts) parts.push(`${m}m`);
  return parts.join("  ");
}

export function isExpired(expiresIso) {
  if (!expiresIso) return false;
  return new Date(expiresIso) <= new Date();
}

// Returns the ISO timestamp for the start of the current CS2 weekly drop window.
// Drops reset every Wednesday at 01:00 UTC.
export function getCurrentWeekStart() {
  const now = new Date();
  const day  = now.getUTCDay();   // 0=Sun … 3=Wed … 6=Sat
  const hour = now.getUTCHours();

  let daysBack;
  if (day === 3 && hour >= 1) daysBack = 0;       // this Wednesday, after reset
  else if (day === 3)         daysBack = 7;       // this Wednesday, before reset → last week
  else if (day > 3)           daysBack = day - 3; // Thu/Fri/Sat
  else                        daysBack = day + 4; // Sun=4, Mon=5, Tue=6

  const d = new Date(now);
  d.setUTCDate(now.getUTCDate() - daysBack);
  d.setUTCHours(1, 0, 0, 0);
  return d.toISOString();
}
