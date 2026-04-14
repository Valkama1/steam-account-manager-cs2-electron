import { useState } from "react";
import styles from "../App.module.css";

function timeAgo(iso) {
  const ms    = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

export default function WatchlistPanel({ watchlist, onClose, onAdd, onRemove, onCheckAll, checking }) {
  const [url, setUrl]         = useState("");
  const [adding, setAdding]   = useState(false);
  const [addError, setAddError] = useState(null);

  async function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      await onAdd(trimmed);
      setUrl("");
    } catch (e) {
      setAddError(e.message);
    }
    setAdding(false);
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.watchlistModal}`} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Ban Watcher</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.watchlistAddRow}>
          <input
            className={styles.watchlistInput}
            value={url}
            onChange={e => { setUrl(e.target.value); setAddError(null); }}
            placeholder="steamcommunity.com/id/… or /profiles/…"
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            disabled={adding}
          />
          <button
            className={styles.addBtn}
            style={{ width: "auto", padding: "0 16px" }}
            onClick={handleAdd}
            disabled={adding || !url.trim()}
          >{adding ? "Adding…" : "Add"}</button>
        </div>
        {addError && <p className={styles.watchlistError}>{addError}</p>}

        <div className={styles.watchlistBody}>
          {watchlist.length === 0 ? (
            <p className={styles.empty} style={{ padding: "24px 0", textAlign: "center" }}>
              No accounts being watched — add a Steam profile URL above.
            </p>
          ) : watchlist.map(entry => {
            const banned = entry.vacBanned || entry.gameBans > 0;
            return (
              <div key={entry.id} className={`${styles.watchlistEntry} ${banned ? styles.watchlistEntryBanned : ""}`}>
                {entry.avatar
                  ? <img src={entry.avatar} alt="" className={styles.watchlistAvatar} />
                  : <div className={styles.watchlistAvatarPlaceholder} />
                }
                <div className={styles.watchlistInfo}>
                  <span className={styles.watchlistName}>
                    {entry.profileName || entry.steamId64 || "Unknown"}
                  </span>
                  <div className={styles.watchlistBadges}>
                    {entry.vacBanned && <span className={styles.watchlistBadgeVac}>VAC Ban</span>}
                    {entry.gameBans > 0 && (
                      <span className={styles.watchlistBadgeGame}>
                        {entry.gameBans} Game Ban{entry.gameBans !== 1 ? "s" : ""}
                      </span>
                    )}
                    {!banned && <span className={styles.watchlistClean}>✓ Clean</span>}
                    {entry.daysSinceLastBan > 0 && (
                      <span className={styles.watchlistMeta}>{entry.daysSinceLastBan}d since last ban</span>
                    )}
                  </div>
                  <span className={styles.watchlistMeta}>
                    {entry.lastChecked && `Checked ${timeAgo(entry.lastChecked)}`}
                    {entry.bannedAt && ` · Ban detected ${timeAgo(entry.bannedAt)}`}
                  </span>
                </div>
                <button
                  className={styles.watchlistRemove}
                  onClick={() => onRemove(entry.id)}
                  title="Stop watching"
                >✕</button>
              </div>
            );
          })}
        </div>

        <div className={styles.watchlistFooter}>
          <span className={styles.watchlistFooterNote}>Auto-checks every 4 hours while the app is open</span>
          <button className={styles.refreshAllBtn} style={{ width: "auto", padding: "6px 14px" }} onClick={onCheckAll} disabled={checking}>
            {checking ? "Checking…" : "↺  Check Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
