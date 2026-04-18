import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "../App.module.css";
import Badge from "./Badge.jsx";
import { PrimeIcon, PremierIcon, RefreshIcon, CloseIcon, EditIcon, TimerIcon, HistoryIcon, CheckIcon, SwitchIcon, StarIcon, StarFilledIcon, CopyIcon, NoteIcon, DragHandleIcon, LeetifyIcon } from "./icons.jsx";
import { parseDuration, remainingStr, isExpired, getCurrentWeekStart } from "../cooldown.js";


export default function AccountCard({ acc, onEdit, onRefresh, onSwitch, onHistory, onToggleDrop, onDropHistory, onSetCooldown, onClearCooldown, onToggleFavorite, onRefreshLeetify, hasLeetify = false, banned, active, isFocused = false, layout = "grid", showSteamId = true, showLoginName = true, showPlaytime = true, showPrimeBadge = true, showPremierBadge = true, draggable = false, isDragOverlay = false }) {
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
  const [idCopied, setIdCopied]     = useState(false);
  const ctxRef = useRef(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acc.id, disabled: !draggable });

  const sortableStyle = draggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : {};

  const weekStart      = getCurrentWeekStart();
  const drops          = acc.weeklyDrops || [];
  const gotDrop        = drops.some(d => d.weekStart === weekStart);
  const hasDropHistory = drops.length > 0;
  const displayName    = acc.alias || acc.profileName || acc.name;
  const displayRating  = acc.leetifyPremierRating ?? acc.premierRating;
  const hasBadges      = showPlaytime || showPrimeBadge || showPremierBadge;
  const hasFooter      = acc.prime || acc.hasPassword || acc.steamId64 || cdOpen;

  useEffect(() => {
    if (!ctxPos) return;
    function close(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxPos(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctxPos]);

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

  function handleCopySteamId() {
    if (!acc.steamId64) return;
    navigator.clipboard.writeText(acc.steamId64).then(() => {
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    });
  }

  async function handleSwitch() {
    setSwitching(true);
    await onSwitch(acc.id);
    setSwitching(false);
  }

  // Notes tooltip (portal, shows full note on hover)
  function NotesChip({ note }) {
    const ref = useRef(null);
    const [tip, setTip] = useState(null);
    function handleEnter() {
      const r = ref.current?.getBoundingClientRect();
      if (r) setTip({ top: r.bottom + 6, left: r.left });
    }
    return (
      <>
        <span ref={ref} className={styles.cardNotes}
              onMouseEnter={handleEnter} onMouseLeave={() => setTip(null)}>
          <NoteIcon size={11} />{note}
        </span>
        {tip && createPortal(
          <div className={styles.cardNotesTooltip} style={{ top: tip.top, left: tip.left }}>
            {note}
          </div>,
          document.body
        )}
      </>
    );
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
      {showPlaytime && (
        <span className={`${styles.badgeCs2} ${acc.cs2Hours == null ? styles.badgeDim : ""}`}>
          {acc.cs2Hours != null ? `${acc.cs2Hours.toLocaleString()}h` : "N/A"}
        </span>
      )}
      {showPrimeBadge && (
        <span className={`${styles.badgePrime} ${!acc.prime ? styles.badgeDim : ""}`}>
          <PrimeIcon size={10} /> Prime
        </span>
      )}
      {showPremierBadge && (
        <span className={`${styles.badgePremier} ${!acc.premierReady && displayRating == null ? styles.badgeDim : ""}`}>
          <PremierIcon size={10} /> Premier
        </span>
      )}
    </div>
  );

  const winRateNum  = acc.leetifyWinRate != null ? parseFloat(acc.leetifyWinRate) : null;
  const ratingNum   = acc.leetifyRating  != null ? acc.leetifyRating              : null;
  const tierColor   = displayRating == null ? "var(--dim)"
    : displayRating >= 30000 ? "#f0c030"
    : displayRating >= 25000 ? "#eb4b4b"
    : displayRating >= 20000 ? "#d32ce6"
    : displayRating >= 15000 ? "#8847ff"
    : displayRating >= 10000 ? "#4b69ff"
    : displayRating >= 5000  ? "#5e98d9"
    : "#b0c3d9";
  const winRateColor = winRateNum == null ? "var(--text)"
    : winRateNum >= 60 ? "var(--green)"
    : winRateNum >= 50 ? "color-mix(in srgb, var(--green) 50%, var(--yellow))"
    : winRateNum >= 40 ? "var(--text)" : "var(--yellow)";
  const ratingColor  = ratingNum == null ? "var(--text)"
    : ratingNum > 0 ? "var(--green)" : ratingNum < 0 ? "var(--red)" : "var(--text)";

  const premierRankEl = showPremierBadge && displayRating != null && (
    <div className={styles.premierRankRow} style={{ borderLeftColor: tierColor, background: `color-mix(in srgb, ${tierColor} 6%, transparent)` }}>
      <div className={styles.premierRankMain}>
        <PremierIcon size={12} />
        <span className={styles.premierRankNum} style={{ color: tierColor }}>
          {displayRating.toLocaleString()}
        </span>
      </div>
      {(winRateNum != null || ratingNum != null) && (
        <div className={styles.premierRankStats}>
          {winRateNum != null && (
            <div className={styles.premierRankStat}>
              <span className={styles.premierRankStatVal} style={{ color: winRateColor }}>{winRateNum.toFixed(0)}%</span>
              <span className={styles.premierRankStatKey}>WR</span>
            </div>
          )}
          {ratingNum != null && (
            <div className={styles.premierRankStat}>
              <span className={styles.premierRankStatVal} style={{ color: ratingColor }}>{ratingNum >= 0 ? "+" : ""}{ratingNum.toFixed(1)}</span>
              <span className={styles.premierRankStatKey}>LR</span>
            </div>
          )}
        </div>
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
          <RefreshIcon size={16} /> {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      )}
      {acc.steamId64 && onRefreshLeetify && (
        <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onRefreshLeetify(acc); }}>
          <LeetifyIcon size={16} /> Refresh Leetify
        </button>
      )}
      <button className={styles.ctxItem} onClick={() => { setCtxPos(null); setCdOpen(true); }}>
        <TimerIcon size={16} /> Set cooldown
      </button>
      {hasCd && (
        <button className={styles.ctxItem} style={{ color: "var(--yellow)" }}
                onClick={() => { setCtxPos(null); onClearCooldown(acc.id); }}>
          <CloseIcon size={16} /> Clear cooldown
        </button>
      )}
      {acc.cooldownHistory?.length > 0 && (
        <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onHistory(); }}>
          <HistoryIcon size={16} /> Cooldown history
        </button>
      )}
      {hasDropHistory && (
        <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onDropHistory(); }}>
          <HistoryIcon size={16} /> Drop history
        </button>
      )}
      <div className={styles.ctxDivider} />
      <button className={styles.ctxItem} onClick={() => { setCtxPos(null); onEdit(); }}>
        <EditIcon size={16} /> Edit
      </button>
    </div>
  );

  const baseClass = `${styles.card} ${hasCd ? styles.cardCd : ""} ${banned ? styles.cardBanned : ""} ${active ? styles.cardActive : ""} ${isFocused ? styles.cardFocused : ""} ${draggable && isDragging ? styles.cardDragging : ""}`;

  if (layout === "list") {
    return (
      <div
        ref={draggable ? setNodeRef : undefined}
        className={`${baseClass} ${styles.cardList}`}
        style={sortableStyle}
        data-account-id={acc.id}
        onContextMenu={handleContextMenu}
        {...(draggable ? attributes : {})}
      >
        {(draggable || isDragOverlay) && (
          <div
            className={`${styles.dragHandle} ${isDragOverlay || isDragging ? styles.dragHandleVisible : ""}`}
            title="Drag to reorder"
            {...(draggable ? listeners : {})}
          >
            <DragHandleIcon size={16} />
          </div>
        )}
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
            <span className={styles.cardSteamId} onClick={handleCopySteamId}
                  title="Click to copy" style={{ cursor: "copy" }}>
              {idCopied ? <><CheckIcon size={10} /> Copied!</> : <><CopyIcon size={10} /> {acc.steamId64}</>}
            </span>
          )}
          {acc.notes && <NotesChip note={acc.notes} />}
          {badgesEl}
          {premierRankEl}
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
                ><CheckIcon size={14} /> {gotDrop ? "Drop" : "Drop"}</button>
              )}
              {(acc.hasPassword || acc.steamId64) && (
                <button
                  className={`${styles.btn} ${acc.hasPassword ? styles.btnAccent : ""}`}
                  onClick={handleSwitch}
                  disabled={switching || !acc.hasPassword}
                  title={!acc.hasPassword ? "No password saved — add one in Edit to enable switching" : undefined}
                >
                  {switching ? <><RefreshIcon size={14} /> Switching…</> : <><SwitchIcon size={14} /> Switch</>}
                </button>
              )}
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {hasLeetify && acc.steamId64 && (
            <button className={styles.lCardBtn} onClick={e => { e.stopPropagation(); window.open(`https://leetify.com/app/profile/${acc.steamId64}`, "_blank"); }} title="View on Leetify">
              <LeetifyIcon size={13} />
            </button>
          )}
          <button
            className={`${styles.starBtn} ${acc.favorite ? styles.starBtnOn : ""}`}
            style={{ position: "static", opacity: acc.favorite ? 1 : undefined }}
            onClick={e => { e.stopPropagation(); onToggleFavorite(acc.id); }}
            title={acc.favorite ? "Remove from favorites" : "Add to favorites"}
          >{acc.favorite ? <StarFilledIcon size={15} /> : <StarIcon size={15} />}</button>
        </div>
        {ctxMenuEl}
      </div>
    );
  }

  // grid layout (vertical card)
  return (
    <div
      ref={draggable ? setNodeRef : undefined}
      className={`${baseClass} ${draggable ? styles.cardDraggable : ""}`}
      style={sortableStyle}
      data-account-id={acc.id}
      onContextMenu={handleContextMenu}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
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
            <span className={styles.cardSteamId} onClick={handleCopySteamId}
                  title="Click to copy" style={{ cursor: "copy" }}>
              {idCopied ? <><CheckIcon size={10} /> Copied!</> : <><CopyIcon size={10} /> {acc.steamId64}</>}
            </span>
          )}
          {acc.notes && <NotesChip note={acc.notes} />}
        </div>
      </div>
      {badgesEl}
      {premierRankEl}
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
                ><CheckIcon size={13} /> {gotDrop ? "Drop" : "Drop"}</button>
              )}
              {(acc.hasPassword || acc.steamId64) && (
                <button
                  className={`${styles.cardFooterBtn} ${acc.hasPassword ? styles.cardFooterBtnAccent : ""}`}
                  onClick={handleSwitch}
                  disabled={switching || !acc.hasPassword}
                  title={!acc.hasPassword ? "No password saved — add one in Edit to enable switching" : undefined}
                >
                  {switching ? <><RefreshIcon size={13} /> Switching…</> : <><SwitchIcon size={13} /> Switch</>}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {/* Corner cluster: Leetify icon + star */}
      <div className={styles.cardCornerActions}>
        {hasLeetify && acc.steamId64 && (
          <button className={styles.lCardBtn} onClick={e => { e.stopPropagation(); window.open(`https://leetify.com/app/profile/${acc.steamId64}`, "_blank"); }} title="View on Leetify">
            <LeetifyIcon size={13} />
          </button>
        )}
        <button
          className={`${styles.starBtn} ${acc.favorite ? styles.starBtnOn : ""}`}
          style={{ position: "static" }}
          onClick={e => { e.stopPropagation(); onToggleFavorite(acc.id); }}
          title={acc.favorite ? "Remove from favorites" : "Add to favorites"}
        >{acc.favorite ? <StarFilledIcon size={15} /> : <StarIcon size={15} />}</button>
      </div>
      {ctxMenuEl}
    </div>
  );
}
