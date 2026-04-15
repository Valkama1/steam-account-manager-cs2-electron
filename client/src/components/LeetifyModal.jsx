import { useState, useEffect } from "react";
import styles from "../App.module.css";
import { CloseIcon, LeetifyIcon, RefreshIcon } from "./icons.jsx";

const MAP_SHORT = {
  "de_dust2":    "Dust2",
  "de_mirage":   "Mirage",
  "de_inferno":  "Inferno",
  "de_nuke":     "Nuke",
  "de_overpass": "Overpass",
  "de_ancient":  "Ancient",
  "de_anubis":   "Anubis",
  "de_vertigo":  "Vertigo",
  "de_train":    "Train",
};

// Percentile color (0–100 scale)
function pctColor(v) {
  if (v == null) return "var(--dim)";
  if (v >= 70)  return "#4db84d";
  if (v >= 55)  return "#80c74d";
  if (v >= 45)  return "var(--fg)";
  if (v >= 30)  return "#e08c3a";
  return "#e05050";
}

// Delta color (+/- values)
function deltaColor(v) {
  if (v == null) return "var(--dim)";
  if (v > 0)  return "#4db84d";
  if (v < 0)  return "#e05050";
  return "var(--fg)";
}

function fmtDelta(v, d = 2) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
}

// fill: 0–1, animate: bool triggers the CSS transition
function Ring({ size, strokeWidth = 9, color, fill, animate, label, children }) {
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = animate
    ? circ * (1 - Math.min(1, Math.max(0, fill)))
    : circ;

  return (
    <div className={styles.lRingWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="color-mix(in srgb, var(--fg) 10%, transparent)"
          strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.85s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      <div className={styles.lRingInner}>
        {children}
        {label && <span className={styles.lRingLabel}>{label}</span>}
      </div>
    </div>
  );
}

function Bar({ label, value, fill, isPercentile }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 60);
    return () => clearTimeout(t);
  }, []);

  const color = isPercentile ? pctColor(value) : deltaColor(value);
  const pct   = animated ? Math.min(100, Math.max(0, fill * 100)) : 0;

  return (
    <div className={styles.lBarRow}>
      <span className={styles.lBarLabel}>{label}</span>
      <div className={styles.lBarTrack}>
        <div className={styles.lBarFill}
          style={{ width: `${pct}%`, background: color,
            transition: "width 0.75s cubic-bezier(0.4, 0, 0.2, 1)" }} />
      </div>
      <span className={styles.lBarVal} style={{ color }}>
        {isPercentile
          ? (value != null ? value.toFixed(0) : "—")
          : fmtDelta(value)}
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

// Normalize a delta rating to 0–1 fill for a ring
// Range approx −2 to +8 → 0 at −2, 1 at +8
function deltaFill(v) {
  return (v + 2) / 10;
}

export default function LeetifyModal({ acc, onClose }) {
  const [data, setData]     = useState(null);
  const [status, setStatus] = useState("loading");
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);
    setAnimate(false);
    fetch(`/api/accounts/${acc.id}/leetify`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.error)   { setStatus("error");     return; }
        if (!d.found)  { setStatus("not_found"); return; }
        setData(d);
        setStatus("ok");
        // small delay so the browser paints the 0-offset state first
        setTimeout(() => { if (!cancelled) setAnimate(true); }, 80);
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [acc.id]);

  const displayName = acc.alias || acc.profileName || acc.name;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.leetifyModal}`} onMouseDown={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <span className={styles.modalTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LeetifyIcon size={15} />
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
              <span className={styles.statsStateSub}>Check that a valid Leetify API key is configured in Settings.</span>
            </div>
          )}

          {status === "ok" && data && (
            <>
              {/* ── Main two-column section ── */}
              <div className={styles.lMainGrid}>

                {/* Left: sub-rating bars */}
                <div className={styles.lBarsCol}>
                  <Bar label="AIM"           value={data.aimRating}     fill={data.aimRating     / 100} isPercentile />
                  <Bar label="UTILITY"       value={data.utilityRating} fill={data.utilityRating / 100} isPercentile />
                  <Bar label="POSITIONING"   value={data.posRating}     fill={data.posRating     / 100} isPercentile />
                  <Bar label="OPENING DUELS" value={data.openingRating} fill={deltaFill(data.openingRating)} />
                  <Bar label="CLUTCHING"     value={data.clutchRating}  fill={deltaFill(data.clutchRating)} />
                </div>

                {/* Right: rings */}
                <div className={styles.lRingsCol}>
                  {/* Row 1: Win Rate + Leetify Rating (big rings) */}
                  <div className={styles.lRingRow}>
                    <Ring size={100} strokeWidth={9}
                      color={pctColor(parseFloat(data.winRate))}
                      fill={data.winRate != null ? parseFloat(data.winRate) / 100 : 0}
                      animate={animate} label="WIN RATE">
                      <span className={styles.lRingValueLg} style={{ color: pctColor(parseFloat(data.winRate)) }}>
                        {data.winRate != null ? `${data.winRate}%` : "—"}
                      </span>
                    </Ring>
                    <Ring size={100} strokeWidth={9}
                      color={deltaColor(data.leetifyRating)}
                      fill={deltaFill(data.leetifyRating)}
                      animate={animate} label="LEETIFY">
                      <span className={styles.lRingValueLg} style={{ color: deltaColor(data.leetifyRating) }}>
                        {fmtDelta(data.leetifyRating)}
                      </span>
                    </Ring>
                  </div>

                  {/* Row 2: CT + T (smaller rings) */}
                  <div className={styles.lRingRow}>
                    <Ring size={68} strokeWidth={7}
                      color={deltaColor(data.ctRating)}
                      fill={deltaFill(data.ctRating)}
                      animate={animate} label="CT">
                      <span className={styles.lRingValueSm} style={{ color: deltaColor(data.ctRating) }}>
                        {fmtDelta(data.ctRating)}
                      </span>
                    </Ring>
                    <Ring size={68} strokeWidth={7}
                      color={deltaColor(data.tRating)}
                      fill={deltaFill(data.tRating)}
                      animate={animate} label="T">
                      <span className={styles.lRingValueSm} style={{ color: deltaColor(data.tRating) }}>
                        {fmtDelta(data.tRating)}
                      </span>
                    </Ring>
                    {data.reactionMs != null && (
                      <Ring size={68} strokeWidth={7}
                        color="var(--accent)"
                        fill={Math.max(0, 1 - (data.reactionMs - 150) / 600)}
                        animate={animate} label="REACT">
                        <span className={styles.lRingValueSm} style={{ color: "var(--accent)" }}>
                          {data.reactionMs}
                          <span style={{ fontSize: 9 }}>ms</span>
                        </span>
                      </Ring>
                    )}
                  </div>

                  {/* HS% and total matches */}
                  <div className={styles.lSmallStats}>
                    {data.hsPct != null && (
                      <div className={styles.lSmallStat}>
                        <span className={styles.lSmallStatVal}>{data.hsPct}%</span>
                        <span className={styles.lSmallStatLbl}>HS%</span>
                      </div>
                    )}
                    {data.totalMatches != null && (
                      <div className={styles.lSmallStat}>
                        <span className={styles.lSmallStatVal}>{data.totalMatches}</span>
                        <span className={styles.lSmallStatLbl}>Matches</span>
                      </div>
                    )}
                    {data.premierRank != null && (
                      <div className={styles.lSmallStat}>
                        <span className={styles.lSmallStatVal}>{data.premierRank.toLocaleString()}</span>
                        <span className={styles.lSmallStatLbl}>Premier</span>
                      </div>
                    )}
                  </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
