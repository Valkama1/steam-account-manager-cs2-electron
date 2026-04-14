import styles from "../App.module.css";
import Badge from "./Badge.jsx";
import { isExpired } from "../cooldown.js";
import { CloseIcon } from "./icons.jsx";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function CooldownHistoryModal({ acc, onClose, onDeleteEntry }) {
  const history = (acc.cooldownHistory || [])
    .map((entry, originalIndex) => ({ ...entry, originalIndex }))
    .reverse();
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            Cooldown History — {acc.alias || acc.profileName || acc.name}
          </span>
          <button className={styles.modalClose} onClick={onClose}><CloseIcon size={14} /></button>
        </div>
        {history.length === 0 ? (
          <p className={styles.empty} style={{ margin: "20px 0" }}>No cooldown history yet.</p>
        ) : (
          <div className={styles.historyList}>
            {history.map((entry) => {
              const expired = isExpired(entry.expiresAt);
              return (
                <div key={entry.originalIndex} className={`${styles.historyRow} ${!expired ? styles.historyRowActive : ""}`}>
                  <div className={styles.historyInput}>{entry.input || "?"}</div>
                  <div className={styles.historyDates}>
                    <span>Started: {fmtDate(entry.startedAt)}</span>
                    <span>{expired ? "Expired" : "Expires"}: {fmtDate(entry.expiresAt)}</span>
                  </div>
                  <div className={styles.historyStatus}>
                    {expired
                      ? <Badge color="var(--dim)" bg="var(--card)">Expired</Badge>
                      : <Badge color="var(--yellow)" bg="color-mix(in srgb, var(--yellow) 12%, transparent)">Active</Badge>
                    }
                  </div>
                  <button
                    className={styles.historyDelete}
                    onClick={() => onDeleteEntry(entry.originalIndex)}
                    title="Remove this entry"
                  ><CloseIcon size={12} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
