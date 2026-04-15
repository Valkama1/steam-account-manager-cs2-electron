import { useState, useEffect } from "react";
import styles from "../App.module.css";
import { CloseIcon, CrosshairIcon, RefreshIcon } from "./icons.jsx";

function StatCard({ label, value, sub }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value ?? "—"}</span>
      <span className={styles.statLabel}>{label}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statRowLabel}>{label}</span>
      <span className={styles.statRowValue}>{value ?? "—"}</span>
    </div>
  );
}

export default function CS2StatsModal({ acc, onClose }) {
  const [stats, setStats]   = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | private | error

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setStats(null);
    fetch(`/api/accounts/${acc.id}/cs2stats`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.private) { setStatus("private"); return; }
        if (data.error)   { setStatus("error");   return; }
        setStats(data);
        setStatus("ok");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [acc.id]);

  const displayName = acc.alias || acc.profileName || acc.name;
  const lm = stats?.lastMatch;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.statsModal}`} onMouseDown={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <span className={styles.modalTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CrosshairIcon size={16} style={{ color: "var(--accent)" }} />
            CS2 Stats — {displayName}
          </span>
          <button className={styles.modalClose} onClick={onClose}><CloseIcon size={14} /></button>
        </div>

        <div className={styles.modalScrollBody}>
          {status === "loading" && (
            <div className={styles.statsState}>
              <RefreshIcon size={20} style={{ animation: "spin 1s linear infinite" }} />
              <span>Fetching stats…</span>
            </div>
          )}

          {status === "private" && (
            <div className={styles.statsState}>
              <CrosshairIcon size={28} style={{ color: "var(--dim)" }} />
              <span className={styles.statsStateTitle}>Stats are private</span>
              <span className={styles.statsStateSub}>
                This Steam profile's game stats are set to private.<br />
                The player can change this under Steam → Privacy Settings → Game Details.
              </span>
            </div>
          )}

          {status === "error" && (
            <div className={styles.statsState}>
              <CrosshairIcon size={28} style={{ color: "var(--red)" }} />
              <span className={styles.statsStateTitle}>Couldn't load stats</span>
              <span className={styles.statsStateSub}>Steam API returned an error. Check that a valid API key is configured.</span>
            </div>
          )}

          {status === "ok" && stats && (<>
            {/* ── Primary stat cards ── */}
            <div className={styles.statCardGrid}>
              <StatCard label="K/D"      value={stats.kd}          />
              <StatCard label="Win Rate" value={stats.matchWinPct != null ? `${stats.matchWinPct}%` : null} sub="matches" />
              <StatCard label="HS%"      value={stats.hsPct != null ? `${stats.hsPct}%` : null} />
              <StatCard label="Accuracy" value={stats.accuracy != null ? `${stats.accuracy}%` : null} />
            </div>

            {/* ── Last match ── */}
            {lm && (lm.kills > 0 || lm.damage > 0) && (
              <div className={styles.statsSection}>
                <span className={styles.statsSectionTitle}>Last Match</span>
                <div className={styles.lastMatchGrid}>
                  <div className={styles.lastMatchStat}>
                    <span className={styles.lastMatchVal}>{lm.kills}/{lm.deaths}</span>
                    <span className={styles.lastMatchLbl}>K/D</span>
                  </div>
                  <div className={styles.lastMatchStat}>
                    <span className={styles.lastMatchVal}>{lm.damage.toLocaleString()}</span>
                    <span className={styles.lastMatchLbl}>Damage</span>
                  </div>
                  <div className={styles.lastMatchStat}>
                    <span className={styles.lastMatchVal}>{lm.hs}</span>
                    <span className={styles.lastMatchLbl}>HS Kills</span>
                  </div>
                  <div className={styles.lastMatchStat}>
                    <span className={styles.lastMatchVal}>{lm.mvps}</span>
                    <span className={styles.lastMatchLbl}>MVPs</span>
                  </div>
                  <div className={styles.lastMatchStat}>
                    <span className={styles.lastMatchVal}>{lm.wins}/{lm.rounds}</span>
                    <span className={styles.lastMatchLbl}>Rounds W/T</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Lifetime ── */}
            <div className={styles.statsSection}>
              <span className={styles.statsSectionTitle}>Lifetime</span>
              <div className={styles.statRowList}>
                <Row label="Matches played" value={stats.totalMatches?.toLocaleString()} />
                <Row label="Matches won"    value={`${stats.totalWins?.toLocaleString()} (${stats.matchWinPct}%)`} />
                <Row label="Total kills"    value={stats.totalKills?.toLocaleString()} />
                <Row label="Total deaths"   value={stats.totalDeaths?.toLocaleString()} />
                <Row label="Total MVPs"     value={stats.totalMVPs?.toLocaleString()} />
                <Row label="Rounds played"  value={stats.totalRounds?.toLocaleString()} />
                <Row label="Hours in CS2"   value={`${stats.timePlayed?.toLocaleString()}h`} />
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
