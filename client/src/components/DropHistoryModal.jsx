import styles from "../App.module.css";
import Badge from "./Badge.jsx";
import { getCurrentWeekStart } from "../cooldown.js";
import { CloseIcon } from "./icons.jsx";
import ModalShell from "./ModalShell.jsx";

function fmtWeek(weekStartIso) {
  const d = new Date(weekStartIso);
  return "Week of " + d.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export default function DropHistoryModal({ acc, onClose }) {
  const drops = [...(acc.weeklyDrops || [])].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const currentWeek = getCurrentWeekStart();
  return (
    <ModalShell onClose={onClose} className={styles.modalWide}>
      {(close) => (<>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            Weekly Drops — {acc.alias || acc.profileName || acc.name}
          </span>
          <button className={styles.modalClose} onClick={close}><CloseIcon size={14} /></button>
        </div>
        <div className={styles.modalScrollBody}>
          {drops.length === 0 ? (
            <p className={styles.empty} style={{ margin: "20px 0" }}>No drops recorded yet.</p>
          ) : (
            <div className={styles.historyList}>
              {drops.map((entry, i) => {
                const isCurrent = entry.weekStart === currentWeek;
                return (
                  <div key={i} className={`${styles.historyRow} ${isCurrent ? styles.historyRowDrop : ""}`}>
                    <div className={styles.historyDates}>
                      <span>{fmtWeek(entry.weekStart)}</span>
                    </div>
                    <div className={styles.historyStatus}>
                      {isCurrent
                        ? <Badge color="var(--green)" bg="color-mix(in srgb, var(--green) 12%, transparent)">This week</Badge>
                        : <Badge color="var(--dim)" bg="var(--card)">Collected</Badge>
                      }
                    </div>
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
