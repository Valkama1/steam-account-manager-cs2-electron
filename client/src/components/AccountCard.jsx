import { useState, useEffect, useRef } from "react";
import styles from "../App.module.css";
import Badge from "./Badge.jsx";
import { PrimeIcon, PremierIcon, PremierRatingBadge, RefreshIcon, CloseIcon } from "./icons.jsx";
import { parseDuration, remainingStr, isExpired, getCurrentWeekStart } from "../cooldown.js";

export default function AccountCard({ acc, onEdit, onRefresh, onSwitch, onHistory, onToggleDrop, onDropHistory, onSetCooldown, onClearCooldown, onToggleFavorite, banned, active, isFocused = false, layout = "grid", showSteamId = true, showLoginName = true, showPlaytime = true, showPrimeBadge = true, showPremierBadge = true, draggable = false, onReorder, onDragStarted, onDragEntered, onDragEnded, isDragging = false, isDropTarget = false, isForbiddenDrop = false }) {
  const expired  = isExpired(acc.expires);
  const hasCd    = acc.expires && !expired;
  const rem      = hasCd ? remainingStr(acc.expires) : null;
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching]   = useState(false);
  const [cdOpen, setCdOpen]         = useState(false);
  const [cdInput, setCdInput]       = useState("");
  const [cdErr, setCdErr]           = useState(false);
  const [cdBusy, setCdBusy]         = useState(false);
  const [ctxPos, setCtxPos]         = useState(null);
  const ctxRef = useRef(null);

  const weekStart      = getCurrentWeekStart();
  const drops          = acc.weeklyDrops || [];
  const gotDrop        = drops.some(d => d.weekStart === weekStart);
  const hasDropHistory = drops.length > 0;
  const displayName    = acc.alias || acc.profileName || acc.name;
  const hasBadges      = (acc.cs2Hours != null && showPlaytime) || (acc.prime && showPrimeBadge) || (acc.premierReady && showPremierBadge);
  const hasFooter      = acc.prime || acc.hasPassword || acc.steamId64 || cdOpen;

  useEffect(() => {
    if (!ctxPos) return;
    function close(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxPos(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctxPos]);

  const dragProps = draggable ? {
    draggable: true,
    onDragStart(e) {
      e.dataTransfer.setData("text/plain", acc.id);
      e.dataTransfer.effectAllowed = "move";
      setTimeout(() => onDragStarted(acc.id), 0);
    },
    onDragEnter(e) {
      if (e.dataTransfer.types.includes("text/plain")) onDragEntered(acc.id);
    },
    onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = isForbiddenDrop ? "none" : "move"; },
    onDrop(e) {
      e.preventDefault();
      if (isForbiddenDrop) return;
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId && draggedId !== acc.id) onReorder(draggedId, acc.id);
    },
    onDragEnd() { onDragEnded(); },
  } : {};

  function handleContextMenu(e) {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth  - 175);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setCtxPos({ x, y });
  }

  async function handleCdSubmit() {
    const expires = parseDuration(cdInput.trim());
    if (!expires) { setCdErr(true); return; }
    setCdBusy(true);
    await onSetCooldown(acc.id, cdInput.trim(), expires);
    setCdBusy(false);
    setCdOpen(false);
    setCdInput("");
    setCdErr(false);
  }

  async function handleRefresh() {
    setCtxPos(null);
    setRefreshing(true);
    await onRefresh(acc.id, acc.steamId64);
    setRefreshing(false);
  }

  async function handleSwitch() {
    setSwitching(true);
    await onSwitch(acc.id);
    setSwitching(false);
  }

  // Shared fragments reused in both layouts
  const nameEl = acc.steamId64 ? (
    <a href={`https://steamcommunity.com/profiles/${acc.steamId64}`} target="_blank" rel="noreferrer"
       className={styles.cardName}>{displayName}</a>
  ) : (
    <span className={styles.cardName}>{displayName}</span>
  );

  const badgesEl = hasBadges && (
    <div className={styles.cardBadges}>
      {acc.cs2Hours != null && showPlaytime && (
        <span className={styles.badgeCs2}>{acc.cs2Hours.toLocaleString()}h</span>
      )}
      {acc.prime && showPrimeBadge && (
        <span className={styles.badgePrime}><PrimeIcon size={10} /> Prime</span>
      )}
      {acc.premierReady && showPremierBadge && (
        acc.premierRating != null
          ? <PremierRatingBadge rating={acc.premierRating} />
          : <span className={styles.badgePremier}><PremierIcon size={10} /> Premier</span>
      )}
    </div>
  );

  const statusEl = (
    <div className={styles.cardStatus}>
      {acc.vacBanned && (
        <Badge color="var(--red)" bg="color-mix(in srgb, var(--red) 12%, transparent)">
          VAC Ban{acc.daysSinceLastBan ? ` · ${acc.daysSinceLastBan}d ago` : ""}
        </Badge>
      )}
      {acc.gameBans > 0 && (
        <Badge color="var(--red)" bg="color-mix(in srgb, var(--red) 12%, transparent)">
          {acc.gameBans} Game Ban{acc.gameBans > 1 ? "s" : ""}{acc.daysSinceLastBan && !acc.vacBanned ? ` · ${acc.daysSinceLastBan}d ago` : ""}
        </Badge>
      )}
      {!acc.vacBanned && !acc.gameBans && hasCd && (
        <>
          <Badge color="var(--yellow)" bg="color-mix(in srgb, var(--yellow) 12%, transparent)"
            title={acc.expires ? `Lifts ${new Date(acc.expires).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : undefined}
          >⏳ Cooldown</Badge>
          <span className={styles.remaining}>{rem}</span>
        </>
      )}
    </div>
  );

  const ctxMenuEl = ctxPos && (
    <div ref={ctxRef} className={styles.ctxMenu} style={{ top: ctxPos.y, left: ctxPos.x }}>
      {acc.steamId64 && (
        <button className={styles.ctxItem} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : <><RefreshIcon size={13} />{"  Refresh"}</>}
        </button>
      )}
      <button className={styles.ctxItem} onClick={() => { setCtxPos(null); setCdOpen(true); }}>
        Set cooldown
      </button>
      {hasCd && (
        <button className={styles.ctxItem} style={{ color: "var(--yellow)" }}
                onClick={() => { setCtxPos(null); onClearCooldown(acc.id); }}>
          Clear cooldown
        </button>
      )}
      {acc.cooldownHistory?.length > 0 && (
        <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onHistory(); }}>
          Cooldown history
        </button>
      )}
      {hasDropHistory && (
        <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onDropHistory(); }}>
          Drop history
        </button>
      )}
      <div className={styles.ctxDivider} />
      <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onEdit(); }}>
        Edit
      </button>
    </div>
  );

  const baseClass = `${styles.card} ${hasCd ? styles.cardCd : ""} ${banned ? styles.cardBanned : ""} ${active ? styles.cardActive : ""} ${isFocused ? styles.cardFocused : ""} ${isDragging ? styles.cardDragging : ""} ${isDropTarget ? styles.cardDragOver : ""} ${isForbiddenDrop ? styles.cardForbiddenDrop : ""}`;

  if (layout === "list") {
    return (
      <div className={`${baseClass} ${styles.cardList}`} data-account-id={acc.id} onContextMenu={handleContextMenu} {...dragProps}>
        {acc.avatar && (acc.steamId64
          ? <a href={`https://steamcommunity.com/profiles/${acc.steamId64}`} target="_blank" rel="noreferrer"><img src={acc.avatar} alt="" className={styles.avatar} /></a>
          : <img src={acc.avatar} alt="" className={styles.avatar} />
        )}
        <div className={styles.cardInfo}>
          {nameEl}
          {showLoginName && (acc.alias || acc.profileName) && (
            <span className={styles.cardAlias}>{acc.name}</span>
          )}
          {showSteamId && acc.steamId64 && (
            <span className={styles.cardSteamId}>{acc.steamId64}</span>
          )}
          {badgesEl}
        </div>
        {statusEl}
        <div className={styles.cardListActions}>
          {cdOpen ? (
            <>
              <input
                className={`${styles.inlineInput} ${cdErr ? styles.inlineInputErr : ""}`}
                value={cdInput}
                onChange={e => { setCdInput(e.target.value); setCdErr(false); }}
                placeholder="20h · 3d · 2w"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") handleCdSubmit();
                  if (e.key === "Escape") { setCdOpen(false); setCdInput(""); setCdErr(false); }
                }}
              />
              <button className={`${styles.cardFooterBtn} ${styles.cardFooterBtnAccent}`}
                      onClick={handleCdSubmit} disabled={cdBusy}>{cdBusy ? "…" : "Set"}</button>
              <button className={styles.cardFooterBtn}
                      onClick={() => { setCdOpen(false); setCdInput(""); setCdErr(false); }}><CloseIcon size={12} /></button>
            </>
          ) : (
            <>
              {acc.prime && (
                <button
                  className={`${styles.btn} ${gotDrop ? styles.btnDropClaimed : ""}`}
                  onClick={() => onToggleDrop(acc.id)}
                  title={gotDrop ? "Drop claimed this week — click to unmark" : "Mark weekly drop as claimed"}
                >{gotDrop ? "✓ Drop" : "Drop"}</button>
              )}
              {(acc.hasPassword || acc.steamId64) && (
                <button className={`${styles.btn} ${styles.btnAccent}`}
                        onClick={handleSwitch} disabled={switching}>
                  {switching ? "Switching…" : "Switch"}
                </button>
              )}
            </>
          )}
        </div>
        <button
          className={`${styles.starBtn} ${acc.favorite ? styles.starBtnOn : ""}`}
          onClick={e => { e.stopPropagation(); onToggleFavorite(acc.id); }}
          title={acc.favorite ? "Remove from favorites" : "Add to favorites"}
        >{acc.favorite ? "★" : "☆"}</button>
        {ctxMenuEl}
      </div>
    );
  }

  // grid layout (vertical card)
  return (
    <div className={baseClass} data-account-id={acc.id} onContextMenu={handleContextMenu} {...dragProps}>
      <div className={styles.cardTop}>
        {acc.avatar && (acc.steamId64
          ? <a href={`https://steamcommunity.com/profiles/${acc.steamId64}`} target="_blank" rel="noreferrer"><img src={acc.avatar} alt="" className={styles.avatar} /></a>
          : <img src={acc.avatar} alt="" className={styles.avatar} />
        )}
        <div className={styles.cardInfo}>
          {nameEl}
          {showLoginName && (acc.alias || acc.profileName) && (
            <span className={styles.cardAlias}>{acc.name}</span>
          )}
          {showSteamId && acc.steamId64 && (
            <span className={styles.cardSteamId}>{acc.steamId64}</span>
          )}
        </div>
      </div>
      {badgesEl}
      {statusEl}
      {hasFooter && (
        <div className={styles.cardFooter}>
          {cdOpen ? (
            <>
              <input
                className={`${styles.inlineInput} ${cdErr ? styles.inlineInputErr : ""}`}
                value={cdInput}
                onChange={e => { setCdInput(e.target.value); setCdErr(false); }}
                placeholder="20h · 3d · 2w"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") handleCdSubmit();
                  if (e.key === "Escape") { setCdOpen(false); setCdInput(""); setCdErr(false); }
                }}
              />
              <button className={`${styles.cardFooterBtn} ${styles.cardFooterBtnAccent}`}
                      onClick={handleCdSubmit} disabled={cdBusy}>{cdBusy ? "…" : "Set"}</button>
              <button className={styles.cardFooterBtn}
                      onClick={() => { setCdOpen(false); setCdInput(""); setCdErr(false); }}><CloseIcon size={12} /></button>
            </>
          ) : (
            <>
              {acc.prime && (
                <button
                  className={`${styles.cardFooterBtn} ${gotDrop ? styles.cardFooterBtnClaimed : ""}`}
                  onClick={() => onToggleDrop(acc.id)}
                  title={gotDrop ? "Drop claimed this week — click to unmark" : "Mark weekly drop as claimed"}
                >{gotDrop ? "✓ Drop" : "Drop"}</button>
              )}
              {(acc.hasPassword || acc.steamId64) && (
                <button className={`${styles.cardFooterBtn} ${styles.cardFooterBtnAccent}`}
                        onClick={handleSwitch} disabled={switching}>
                  {switching ? "Switching…" : "Switch"}
                </button>
              )}
            </>
          )}
        </div>
      )}
      <button
        className={`${styles.starBtn} ${acc.favorite ? styles.starBtnOn : ""}`}
        onClick={e => { e.stopPropagation(); onToggleFavorite(acc.id); }}
        title={acc.favorite ? "Remove from favorites" : "Add to favorites"}
      >{acc.favorite ? "★" : "☆"}</button>
      {ctxMenuEl}
    </div>
  );
}
