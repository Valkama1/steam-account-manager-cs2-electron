import styles from "../App.module.css";
import Badge from "./Badge.jsx";
import { isExpired } from "../cooldown.js";
import { CloseIcon } from "./icons.jsx";
import ModalShell from "./ModalShell.jsx";

const TYPE_META = {
  abandon:       { label: "Abandon",       color: "var(--yellow)" },
  griefing:      { label: "Griefing",      color: "var(--red)"    },
  suspicious:    { label: "Suspicious",    color: "var(--accent)" },
  friendly_fire: { label: "Friendly Fire", color: "var(--red)"    },
  other:         { label: "Other",         color: "var(--dim)"    },
};

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
    <ModalShell onClose={onClose} className={styles.modalWide}>
      {(close) => (<>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            Cooldown History — {acc.alias || acc.profileName || acc.name}
          </span>
          <button className={styles.modalClose} onClick={close}><CloseIcon size={14} /></button>
        </div>
        <div className={styles.modalScrollBody}>
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
                      {entry.type && TYPE_META[entry.type] && (
                        <Badge
                          color={TYPE_META[entry.type].color}
                          bg={`color-mix(in srgb, ${TYPE_META[entry.type].color} 12%, transparent)`}
                        >{TYPE_META[entry.type].label}</Badge>
                      )}
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
      </>)}
    </ModalShell>
  );
}
