import { useState, useEffect } from "react";
import styles from "../App.module.css";
import { CloseIcon, LeetifyIcon, RefreshIcon } from "./icons.jsx";

// 0–100 percentile scores → shown as bars
const BAR_RATINGS = [
  { key: "aimRating",     label: "Aim" },
  { key: "posRating",     label: "Positioning" },
  { key: "utilityRating", label: "Utility" },
];

const MAP_SHORT = {
  "de_dust2":   "Dust2",
  "de_mirage":  "Mirage",
  "de_inferno": "Inferno",
  "de_nuke":    "Nuke",
  "de_overpass":"Overpass",
  "de_ancient": "Ancient",
  "de_anubis":  "Anubis",
  "de_vertigo": "Vertigo",
  "de_train":   "Train",
};

// For 0-100 percentile scores (Aim, Pos, Utility)
function percentileColor(r) {
  if (r == null) return "var(--dim)";
  if (r >= 70)  return "#4db84d";
  if (r >= 55)  return "#80c74d";
  if (r >= 45)  return "var(--fg)";
  if (r >= 30)  return "#e08c3a";
  return "#e05050";
}

// For delta scores (CT, T, Clutch, Opening, Overall) — positive = green, negative = red
function deltaColor(r) {
  if (r == null) return "var(--dim)";
  if (r > 0)  return "#4db84d";
  if (r < 0)  return "#e05050";
  return "var(--fg)";
}

function fmtDelta(v, decimals = 2) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}`;
}

function RatingBar({ label, value }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className={styles.lRatingRow}>
      <span className={styles.lRatingLabel}>{label}</span>
      <div className={styles.lRatingTrack}>
        <div className={styles.lRatingFill} style={{ width: `${pct}%`, background: percentileColor(value) }} />
      </div>
      <span className={styles.lRatingVal} style={{ color: percentileColor(value) }}>
        {value != null ? value.toFixed(0) : "—"}
      </span>
    </div>
  );
}

function MatchRow({ match }) {
  const mapLabel = MAP_SHORT[match.map] ?? match.map;
  const score    = Array.isArray(match.score) ? match.score.join(" : ") : null;
  const won      = match.outcome === "win";
  const lost     = match.outcome === "loss";
  const date     = match.finishedAt
    ? new Date(match.finishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className={styles.lMatchRow}>
      <span className={`${styles.lMatchOutcome} ${won ? styles.lMatchWin : lost ? styles.lMatchLoss : styles.lMatchDraw}`}>
        {won ? "W" : lost ? "L" : "D"}
      </span>
      <span className={styles.lMatchMap}>{mapLabel}</span>
      {score && <span className={styles.lMatchScore}>{score}</span>}
      {match.rating != null && (
        <span className={styles.lMatchRating} style={{ color: deltaColor(match.rating) }}>
          {fmtDelta(match.rating)}
        </span>
      )}
      {date && <span className={styles.lMatchDate}>{date}</span>}
    </div>
  );
}

export default function LeetifyModal({ acc, onClose }) {
  const [data, setData]     = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);
    fetch(`/api/accounts/${acc.id}/leetify`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.error)        { setStatus("error");    return; }
        if (!d.found)       { setStatus("not_found"); return; }
        setData(d);
        setStatus("ok");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [acc.id]);

  const displayName = acc.alias || acc.profileName || acc.name;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.statsModal}`} onMouseDown={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <span className={styles.modalTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LeetifyIcon size={16} style={{ color: "var(--accent)" }} />
            Leetify — {displayName}
          </span>
          <button className={styles.modalClose} onClick={onClose}><CloseIcon size={14} /></button>
        </div>

        <div className={styles.modalScrollBody}>
          {status === "loading" && (
            <div className={styles.statsState}>
              <RefreshIcon size={20} style={{ animation: "spin 1s linear infinite" }} />
              <span>Fetching Leetify data…</span>
            </div>
          )}

          {status === "not_found" && (
            <div className={styles.statsState}>
              <LeetifyIcon size={32} style={{ color: "var(--dim)" }} />
              <span className={styles.statsStateTitle}>No Leetify profile found</span>
              <span className={styles.statsStateSub}>This account hasn't played tracked matches on Leetify yet.</span>
            </div>
          )}

          {status === "error" && (
            <div className={styles.statsState}>
              <LeetifyIcon size={32} style={{ color: "var(--red)" }} />
              <span className={styles.statsStateTitle}>Couldn't load Leetify data</span>
              <span className={styles.statsStateSub}>Check that a valid Leetify API key is configured.</span>
            </div>
          )}

          {status === "ok" && data && (<>
            {/* ── Top rating cards ── */}
            <div className={styles.statCardGrid}>
              <div className={styles.statCard}>
                <span className={styles.statValue} style={{ color: deltaColor(data.leetifyRating) }}>
                  {fmtDelta(data.leetifyRating)}
                </span>
                <span className={styles.statLabel}>Leetify Rating</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue} style={{ color: deltaColor(data.ctRating) }}>
                  {fmtDelta(data.ctRating)}
                </span>
                <span className={styles.statLabel}>CT Rating</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue} style={{ color: deltaColor(data.tRating) }}>
                  {fmtDelta(data.tRating)}
                </span>
                <span className={styles.statLabel}>T Rating</span>
              </div>
              {data.premierRank != null && (
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{data.premierRank.toLocaleString()}</span>
                  <span className={styles.statLabel}>Premier</span>
                </div>
              )}
            </div>

            {/* ── Sub-ratings ── */}
            <div className={styles.statsSection}>
              <span className={styles.statsSectionTitle}>Sub-Ratings</span>
              <div className={styles.lRatingList}>
                {BAR_RATINGS.map(({ key, label }) => (
                  <RatingBar key={key} label={label} value={data[key]} />
                ))}
              </div>
            </div>

            {/* ── Quick stats ── */}
            <div className={styles.statsSection}>
              <span className={styles.statsSectionTitle}>Stats</span>
              <div className={styles.statRowList}>
                {data.clutchRating  != null && <div className={styles.statRow}><span className={styles.statRowLabel}>Clutching</span><span className={styles.statRowValue} style={{ color: deltaColor(data.clutchRating) }}>{fmtDelta(data.clutchRating)}</span></div>}
                {data.openingRating != null && <div className={styles.statRow}><span className={styles.statRowLabel}>Opening Duels</span><span className={styles.statRowValue} style={{ color: deltaColor(data.openingRating) }}>{fmtDelta(data.openingRating)}</span></div>}
                {data.winRate    != null && <div className={styles.statRow}><span className={styles.statRowLabel}>Win Rate</span><span className={styles.statRowValue}>{data.winRate}%</span></div>}
                {data.hsPct      != null && <div className={styles.statRow}><span className={styles.statRowLabel}>Headshot %</span><span className={styles.statRowValue}>{data.hsPct}%</span></div>}
                {data.reactionMs != null && <div className={styles.statRow}><span className={styles.statRowLabel}>Reaction Time</span><span className={styles.statRowValue}>{data.reactionMs} ms</span></div>}
                {data.totalMatches != null && <div className={styles.statRow}><span className={styles.statRowLabel}>Total Matches</span><span className={styles.statRowValue}>{data.totalMatches.toLocaleString()}</span></div>}
              </div>
            </div>

            {/* ── Recent matches ── */}
            {data.recentMatches?.length > 0 && (
              <div className={styles.statsSection}>
                <span className={styles.statsSectionTitle}>Recent Matches</span>
                <div className={styles.lMatchList}>
                  {data.recentMatches.map(m => <MatchRow key={m.id} match={m} />)}
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
