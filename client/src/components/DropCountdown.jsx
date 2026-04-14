import { useState, useEffect } from "react";
import styles from "../App.module.css";
import { getCurrentWeekStart } from "../cooldown.js";

export default function DropCountdown({ collapsed = false }) {
  const [parts, setParts] = useState({ d: 0, h: 0, m: 0, sec: 0, done: false });
  useEffect(() => {
    function tick() {
      const nextReset = new Date(getCurrentWeekStart()).getTime() + 7 * 24 * 60 * 60 * 1000;
      const diff = nextReset - Date.now();
      if (diff <= 0) { setParts({ done: true }); return; }
      const s = Math.floor(diff / 1000);
      setParts({
        d: Math.floor(s / 86400),
        h: Math.floor((s % 86400) / 3600),
        m: Math.floor((s % 3600) / 60),
        sec: s % 60,
        done: false,
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (collapsed) {
    const short = parts.done ? "—" : parts.d > 0 ? `${parts.d}d` : parts.h > 0 ? `${parts.h}h` : `${parts.m}m`;
    return (
      <div className={`${styles.dropCountdown} ${styles.dropCountdownCollapsed}`} title="Next drop reset">
        <span className={styles.dropCountdownTime} style={{ fontSize: "13px" }}>{short}</span>
      </div>
    );
  }

  const full = parts.done ? "Resetting…" : [
    parts.d ? `${parts.d}d` : null,
    `${String(parts.h).padStart(2, "0")}h`,
    `${String(parts.m).padStart(2, "0")}m`,
    `${String(parts.sec).padStart(2, "0")}s`,
  ].filter(Boolean).join("  ");

  return (
    <div className={styles.dropCountdown}>
      <span className={styles.dropCountdownLabel}>Next drop reset</span>
      <span className={styles.dropCountdownTime}>{full}</span>
    </div>
  );
}
