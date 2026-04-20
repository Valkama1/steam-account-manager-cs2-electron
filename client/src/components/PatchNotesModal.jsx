import { useState, useEffect, useRef } from "react";
import styles from "../App.module.css";
import { CloseIcon, PlusIcon, RefreshIcon } from "./icons.jsx";
import ModalShell from "./ModalShell.jsx";

function stripMarkup(text) {
  if (!text) return "";
  return text
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, "")   // remove BBCode images + their URLs
    .replace(/\[[\s\S]*?\]/g, "")                 // strip remaining BBCode tags
    .replace(/<img[^>]*>/gi, "")                  // strip HTML img tags (self-closing)
    .replace(/<[^>]+>/g, " ")                     // strip remaining HTML tags
    .replace(/https?:\/\/\S+/g, "")              // strip any bare URLs left over
    .replace(/&[a-z#0-9]+;/gi, " ")              // strip HTML entities
    .replace(/\s{2,}/g, " ")
    .trim();
}

function timeAgo(unix) {
  const ms    = Date.now() - unix * 1000;
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

export default function PatchNotesModal({ onClose }) {
  const [trackedGames, setTrackedGames]   = useState([]);
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [news, setNews]                   = useState([]);
  const [newsLoading, setNewsLoading]     = useState(false);
  const [adding, setAdding]               = useState(false);
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const searchTimeout = useRef(null);

  useEffect(() => {
    fetch("/api/patch-notes/tracked")
      .then(r => r.json())
      .then(data => {
        setTrackedGames(data);
        if (data.length > 0) setSelectedAppId(data[0].appid);
      });
  }, []);

  useEffect(() => {
    if (!selectedAppId) { setNews([]); return; }
    setNewsLoading(true);
    fetch(`/api/patch-notes/news/${selectedAppId}`)
      .then(r => r.json())
      .then(data => { setNews(data.items || []); setNewsLoading(false); })
      .catch(() => setNewsLoading(false));
  }, [selectedAppId]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); return; }
    clearTimeout(searchTimeout.current);
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/patch-notes/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await r.json();
        setSearchResults(data.items || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  async function addGame(game) {
    const r = await fetch("/api/patch-notes/tracked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appid: game.id, name: game.name, icon: game.tiny_image }),
    });
    const updated = await r.json();
    setTrackedGames(updated);
    setSelectedAppId(game.id);
    setAdding(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  async function removeGame(appid) {
    const r = await fetch(`/api/patch-notes/tracked/${appid}`, { method: "DELETE" });
    const updated = await r.json();
    setTrackedGames(updated);
    if (selectedAppId === appid) setSelectedAppId(updated[0]?.appid ?? null);
  }

  const selectedGame = trackedGames.find(g => g.appid === selectedAppId);

  return (
    <ModalShell onClose={onClose} className={styles.patchNotesModal}>
      {(close) => (<>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Patch Notes</span>
          <button className={styles.modalClose} onClick={close}><CloseIcon size={14} /></button>
        </div>

        <div className={styles.patchNotesBody}>
          {/* ── left: game list ── */}
          <div className={styles.patchNotesSidebar}>
            {trackedGames.map(game => (
              <div
                key={game.appid}
                className={`${styles.patchNotesGame} ${selectedAppId === game.appid ? styles.patchNotesGameSelected : ""}`}
                onClick={() => setSelectedAppId(game.appid)}
              >
                {game.icon
                  ? <img src={game.icon} alt="" className={styles.patchNotesGameIcon} />
                  : <div className={styles.patchNotesGameIconPlaceholder} />
                }
                <span className={styles.patchNotesGameName}>{game.name}</span>
                <button
                  className={styles.patchNotesGameRemove}
                  onClick={e => { e.stopPropagation(); removeGame(game.appid); }}
                  title="Remove"
                ><CloseIcon size={10} /></button>
              </div>
            ))}

            {adding ? (
              <div className={styles.patchNotesAddBox}>
                <input
                  className={styles.patchNotesSearchInput}
                  placeholder="Search games…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Escape") { setAdding(false); setSearchQuery(""); setSearchResults([]); }
                  }}
                />
                {searching && <div className={styles.patchNotesSearchHint}>Searching…</div>}
                {searchResults.length > 0 && (
                  <div className={styles.patchNotesSearchResults}>
                    {searchResults.slice(0, 8).map(r => (
                      <div key={r.id} className={styles.patchNotesSearchResult} onClick={() => addGame(r)}>
                        {r.tiny_image && <img src={r.tiny_image} alt="" className={styles.patchNotesResultIcon} />}
                        <span className={styles.patchNotesResultName}>{r.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button className={styles.patchNotesAddBtn} onClick={() => setAdding(true)}>
                <PlusIcon size={12} /> Add game
              </button>
            )}
          </div>

          {/* ── right: news feed ── */}
          <div className={styles.patchNotesFeed}>
            {selectedGame && (
              <div className={styles.patchNotesFeedHeader}>
                {selectedGame.icon && <img src={selectedGame.icon} alt="" className={styles.patchNotesFeedIcon} />}
                <span className={styles.patchNotesFeedTitle}>{selectedGame.name}</span>
              </div>
            )}
            {!selectedAppId ? (
              <div className={styles.patchNotesEmpty}>Add a game to track its updates</div>
            ) : newsLoading ? (
              <div className={styles.patchNotesEmpty}><RefreshIcon size={16} /> Loading…</div>
            ) : news.length === 0 ? (
              <div className={styles.patchNotesEmpty}>No recent updates found</div>
            ) : news.map(item => {
              const body = stripMarkup(item.contents);
              return (
                <div key={item.gid} className={styles.patchNotesItem}>
                  <div className={styles.patchNotesItemHeader}>
                    <span className={styles.patchNotesItemTitle}>{item.title}</span>
                    <span className={styles.patchNotesItemMeta}>{timeAgo(item.date)}</span>
                  </div>
                  {item.feedlabel && <span className={styles.patchNotesItemTag}>{item.feedlabel}</span>}
                  {body && (
                    <p className={styles.patchNotesItemBody}>
                      {body.length > 280 ? body.slice(0, 280) + "…" : body}
                    </p>
                  )}
                  <a href={item.url} target="_blank" rel="noreferrer" className={styles.patchNotesItemLink}>
                    Read on Steam →
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </>)}
    </ModalShell>
  );
}
