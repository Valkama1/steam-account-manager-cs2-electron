import { useEffect, useRef } from "react";
import styles from "../App.module.css";
import { CloseIcon, BellIcon } from "./icons.jsx";

const TYPE_META = {
  vac_ban:    { label: "VAC Ban",    color: "var(--red)"    },
  game_ban:   { label: "Game Ban",   color: "var(--red)"    },
  patch_note: { label: "Update",     color: "var(--accent)" },
};

const SOURCE_META = {
  account:   "Personal account",
  watchlist: "Ban Watcher",
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationsPanel({ notifications, onClose, onClearAll, onDismiss, anchor }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (e.target.closest("[data-notif-trigger]")) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={panelRef} className={styles.notifPanel} style={anchor ? {
      left: anchor.left,
      top: Math.min(anchor.top, window.innerHeight - 496),
    } : undefined}>
      <div className={styles.notifHeader}>
        <span className={styles.notifTitle}>
          <BellIcon size={14} /> Notifications
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {notifications.length > 0 && (
            <button className={styles.notifClearBtn} onClick={onClearAll}>Clear all</button>
          )}
          <button className={styles.notifCloseBtn} onClick={onClose}><CloseIcon size={13} /></button>
        </div>
      </div>

      <div className={styles.notifList}>
        {notifications.length === 0 ? (
          <div className={styles.notifEmpty}>
            <BellIcon size={24} />
            <span>No notifications</span>
          </div>
        ) : (
          notifications.map(n => {
            const meta = TYPE_META[n.type] || { label: n.type, color: "var(--dim)" };
            const isPatchNote = n.type === "patch_note";
            return (
              <div key={n.id} className={styles.notifItem}>
                <div className={styles.notifDot} style={{ background: meta.color }} />
                <div className={styles.notifBody}>
                  <div className={styles.notifItemTitle}>
                    <span className={styles.notifName}>
                      {isPatchNote ? n.gameName : n.accountName}
                    </span>
                    <span className={styles.notifBadge} style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)` }}>
                      {meta.label}
                    </span>
                  </div>
                  {isPatchNote && n.title && (
                    <div className={styles.notifPatchTitle}>
                      <a href={n.url} target="_blank" rel="noreferrer" className={styles.notifPatchLink}>
                        {n.title}
                      </a>
                    </div>
                  )}
                  <div className={styles.notifMeta}>
                    {isPatchNote ? "Patch Notes" : (SOURCE_META[n.source] ?? n.source)} · {timeAgo(n.createdAt)}
                  </div>
                </div>
                <button className={styles.notifDismiss} onClick={() => onDismiss(n.id)} title="Dismiss">
                  <CloseIcon size={11} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
