import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy } from "@dnd-kit/sortable";
import { isExpired, getCurrentWeekStart } from "./cooldown.js";
import styles from "./App.module.css";
import { API, THEME_PRESETS, SETTINGS_KEY, SORT_OPTIONS } from "./constants.js";
import { readSettings, readFilterCookie, writeFilterCookie, sortAccounts } from "./utils.js";
import AccountCard from "./components/AccountCard.jsx";
import AccountModal from "./components/AccountModal.jsx";
import CooldownHistoryModal from "./components/CooldownHistoryModal.jsx";
import DropHistoryModal from "./components/DropHistoryModal.jsx";
import LeetifyModal from "./components/LeetifyModal.jsx";
import DropCountdown from "./components/DropCountdown.jsx";
import Section from "./components/Section.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import WatchlistPanel from "./components/WatchlistPanel.jsx";
import NotificationsPanel from "./components/NotificationsPanel.jsx";
import { FlagIcon, SettingsIcon, RefreshIcon, PlusIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon, BellIcon } from "./components/icons.jsx";

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [modal, setModal]         = useState(null);
  const [historyAcc, setHistoryAcc]       = useState(null);
  const [dropHistoryAcc, setDropHistoryAcc] = useState(null);
  const [statsAcc, setStatsAcc]           = useState(null);
  const [leetifyCache, setLeetifyCache]   = useState({});
  const [apiKey, setApiKey]             = useState("");
  const [keyDraft, setKeyDraft]         = useState("");
  const [leetifyKey, setLeetifyKey]     = useState("");
  const [leetifyDraft, setLeetifyDraft] = useState("");
  const [activeAccount, setActiveAccount] = useState(null); // login name of currently active Steam account
  const [search, setSearch]               = useState("");
  const [activeFilters, setActiveFilters] = useState(() => readFilterCookie());
  const [settings, setSettings]           = useState(() => readSettings());
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlist, setWatchlist]         = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifAnchor, setNotifAnchor]     = useState(null);
  const [watchChecking, setWatchChecking] = useState(false);
  const [activeId, setActiveId]               = useState(null);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("steamgr_collapsed") || "{}"); }
    catch { return {}; }
  });
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const searchRef   = useRef(null);
  const focusedIdxRef = useRef(-1);
  const allVisibleRef = useRef([]);
  useEffect(() => { focusedIdxRef.current = focusedIdx; }, [focusedIdx]);

  function toggleSection(title) {
    setCollapsedSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem("steamgr_collapsed", JSON.stringify(next));
      return next;
    });
  }
  const addToast = useCallback((message, type = "error") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const r = await fetch(API);
      const data = await r.json();
      setAccounts(data);
      setError(null);
    } catch {
      setError("Cannot reach server — is it running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    const id = setInterval(fetchAccounts, 30_000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  // ── Leetify background check ──────────────────────────────────────────────
  useEffect(() => {
    if (!leetifyKey) return;
    const candidates = accounts.filter(a => a.steamId64 && !(a.id in leetifyCache));
    if (!candidates.length) return;
    candidates.forEach(a => {
      fetch(`/api/accounts/${a.id}/leetify`)
        .then(r => r.json())
        .then(d => {
          setLeetifyCache(prev => ({ ...prev, [a.id]: !!(d?.found) }));
        })
        .catch(() => {});
    });
  }, [accounts, leetifyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notifications ──
  const fetchNotifications = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications");
      if (r.ok) setNotifications(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  function handleToggleNotif(e) {
    if (notifOpen) { setNotifOpen(false); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setNotifAnchor({ top: rect.top, left: rect.right + 8 });
    setNotifOpen(true);
  }

  async function handleClearAllNotifs() {
    await fetch("/api/notifications", { method: "DELETE" });
    setNotifications([]);
  }

  async function handleDismissNotif(id) {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  // ── Watchlist ──
  const fetchWatchlist = useCallback(async () => {
    const r = await fetch("/api/watchlist");
    if (!r.ok) return;
    const list = await r.json();
    setWatchlist(prev => {
      // Notify for any newly-banned entries the server flagged
      const newlyBanned = list.filter(e =>
        !e.notified && (e.vacBanned || e.gameBans > 0) &&
        !prev.find(p => p.id === e.id && !p.notified)
      );
      for (const e of newlyBanned) {
        const label = e.vacBanned ? "VAC ban" : `${e.gameBans} game ban(s)`;
        addToast(`Ban detected: ${e.profileName || e.steamId64} — ${label}`, "error");
        if (Notification.permission === "granted") {
          new Notification("Ban Detected", {
            body: `${e.profileName || e.steamId64} received a ${label}`,
            icon: e.avatar || undefined,
          });
        }
        fetch(`/api/watchlist/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notified: true }) });
      }
      return list;
    });
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchWatchlist();
    const id = setInterval(fetchWatchlist, 60_000);
    return () => clearInterval(id);
  }, [fetchWatchlist]);

  async function handleAddWatch(profileUrl) {
    const r = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrl }),
    });
    if (!r.ok) {
      let msg = `Server error (${r.status})`;
      try { const d = await r.json(); msg = d.error || msg; } catch {
        try { const t = await r.text(); msg = t.slice(0, 120); } catch {}
      }
      throw new Error(msg);
    }
    const data = await r.json();
    setWatchlist(prev => [...prev, data]);
  }

  async function handleRemoveWatch(id) {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    setWatchlist(prev => prev.filter(e => e.id !== id));
  }

  async function handleCheckAllWatch() {
    setWatchChecking(true);
    const r = await fetch("/api/watchlist/check", { method: "POST" });
    if (r.ok) await fetchWatchlist();
    setWatchChecking(false);
  }

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(cfg => {
      setApiKey(cfg.steamApiKey || "");
      setKeyDraft(cfg.steamApiKey || "");
      setLeetifyKey(cfg.leetifyApiKey || "");
      setLeetifyDraft(cfg.leetifyApiKey || "");
      if (cfg.lastRefreshed) setLastRefreshed(new Date(cfg.lastRefreshed));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function pollActive() {
      fetch("/api/steam-active").then(r => r.json())
        .then(d => setActiveAccount(d.running ? d.account : null))
        .catch(() => setActiveAccount(null));
    }
    pollActive();
    const id = setInterval(pollActive, 5000);
    return () => clearInterval(id);
  }, []);

  async function handleSaveKey() {
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steamApiKey: keyDraft.trim() }),
    });
    setApiKey(keyDraft.trim());
  }

  async function handleSaveLeetifyKey() {
    const trimmed = leetifyDraft.trim();
    await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leetifyApiKey: trimmed }),
    });
    setLeetifyKey(trimmed);
    // Re-check all accounts against the new key
    setLeetifyCache({});
  }

  async function handleClearCache() {
    const r = await fetch(`${API}/clear-cache`, { method: "POST" });
    if (r.ok) setAccounts(await r.json());
    addToast("API cache cleared", "success");
  }

  // close modals on Escape
  useEffect(() => {
    if (!modal) return;
    const handler = (e) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal]);
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => { if (e.key === "Escape") setSettingsOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen]);

  // ── add ──
  async function handleAdd(data) {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchAccounts();
    setModal(null);
  }

  // ── edit ──
  async function handleEdit(id, data) {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchAccounts();
    setModal(null);
  }

  // ── delete ──
  async function handleDelete(id) {
    await fetch(`${API}/${id}`, { method: "DELETE" });
    setAccounts(prev => prev.filter(a => a.id !== id));
    setModal(null);
  }

  // ── refresh Steam profile ──
  async function handleRefresh(id, steamId64) {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrl: `https://steamcommunity.com/profiles/${steamId64}` }),
    });
    await fetchAccounts();
  }

  const [refreshingAll, setRefreshingAll] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  async function handleRefreshAll() {
    const withId = accounts.filter(a => a.steamId64);
    if (!withId.length) return;
    setRefreshingAll(true);
    const r = await fetch(`${API}/refresh-all`, { method: "POST" });
    if (r.ok) setAccounts(await r.json());
    setRefreshingAll(false);
    const now = new Date();
    setLastRefreshed(now);
    fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastRefreshed: now.toISOString() }) }).catch(() => {});
    addToast(`Refreshed ${withId.length} accounts`, "success");
  }

  // ── auto-refresh ──
  const refreshingAllRef = useRef(false);
  useEffect(() => { refreshingAllRef.current = refreshingAll; }, [refreshingAll]);
  useEffect(() => {
    if (!settings.autoRefreshInterval) return;
    const ms = settings.autoRefreshInterval * 60 * 1000;
    const id = setInterval(() => {
      if (!refreshingAllRef.current) handleRefreshAll();
    }, ms);
    return () => clearInterval(id);
  }, [settings.autoRefreshInterval]);

  // ── toggle weekly drop ──
  async function handleToggleDrop(id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc || !acc.prime) return;
    const weekStart = getCurrentWeekStart();
    const drops = acc.weeklyDrops || [];
    const hasDrop = drops.some(d => d.weekStart === weekStart);
    const updated = hasDrop
      ? drops.filter(d => d.weekStart !== weekStart)
      : [...drops, { weekStart }];
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, weeklyDrops: updated } : a));
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyDrops: updated }),
    });
  }

  // ── clear active cooldown ──
  async function handleClearCooldown(id) {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires: null, cooldownInput: null }),
    });
    await fetchAccounts();
  }

  // ── delete one entry from cooldown history ──
  async function handleDeleteHistoryEntry(accId, originalIndex) {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;
    const newHistory = (acc.cooldownHistory || []).filter((_, i) => i !== originalIndex);
    await fetch(`${API}/${accId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cooldownHistory: newHistory }),
    });
    await fetchAccounts();
    setHistoryAcc(prev => prev?.id === accId ? { ...prev, cooldownHistory: newHistory } : prev);
  }

  // ── set cooldown directly (from card menu) ──
  async function handleSetCooldown(id, cooldownInput, expires) {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires, cooldownInput }),
    });
    await fetchAccounts();
  }

  // ── switch account ──
  async function handleSwitch(id) {
    const acc = accounts.find(a => a.id === id);
    const r = await fetch(`/api/switch/${id}`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) {
      addToast(`Switch failed: ${data.error}`);
      return;
    }
    // Poll steam-active for up to 15s to confirm the switch landed
    const expected = acc?.name?.toLowerCase();
    if (!expected) return;
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const pr = await fetch("/api/steam-active");
        const pd = await pr.json();
        if (pd.running && pd.account?.toLowerCase() === expected) {
          setActiveAccount(pd.account);
          addToast(`Switched to ${acc.alias || acc.profileName || acc.name}`, "success");
          clearInterval(poll);
        } else if (attempts >= 15) {
          clearInterval(poll);
        }
      } catch { clearInterval(poll); }
    }, 1000);
  }

  async function handleToggleFavorite(id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    const r = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !acc.favorite }),
    });
    if (r.ok) {
      const updated = await r.json();
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
    }
  }

  function handleReorder(draggedId, targetId) {
    if (draggedId === targetId) return;
    setSettings(prev => {
      const allIds = accounts.map(a => a.id);
      const order = [...(prev.customOrder || [])];
      for (const id of allIds) { if (!order.includes(id)) order.push(id); }
      const from = order.indexOf(draggedId);
      const to   = order.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      order.splice(from, 1);
      order.splice(to, 0, draggedId);
      return { ...prev, customOrder: order };
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart({ active }) {
    setActiveId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const sectionOf = id =>
      visibleFavorites.some(a => a.id === id) ? "fav" :
      visibleOk.some(a => a.id === id)        ? "ok"  :
      visibleCooldown.some(a => a.id === id)  ? "cd"  :
      visibleBanned.some(a => a.id === id)    ? "ban" : null;
    if (sectionOf(active.id) !== sectionOf(over.id)) return;
    handleReorder(active.id, over.id);
  }

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      (a.name        || "").toLowerCase().includes(q) ||
      (a.alias       || "").toLowerCase().includes(q) ||
      (a.profileName || "").toLowerCase().includes(q) ||
      (a.steamId64   || "").includes(q)
    );
  }, [accounts, search]);

  const { favorites, banned, onCooldown, ok } = useMemo(() => {
    const favorites   = searched.filter(a => a.favorite);
    const favIds      = new Set(favorites.map(a => a.id));
    const nonFav      = searched.filter(a => !favIds.has(a.id));
    const banned      = nonFav.filter(a => a.vacBanned || a.gameBans > 0);
    const bannedIds   = new Set(banned.map(a => a.id));
    return {
      favorites,
      banned,
      onCooldown: nonFav.filter(a => !bannedIds.has(a.id) && a.expires && !isExpired(a.expires)),
      ok:         nonFav.filter(a => !bannedIds.has(a.id) && (!a.expires || isExpired(a.expires))),
    };
  }, [searched]);

  // ── settings persistence + theme apply ───────────────────────────────────────
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    function applyColors() {
      const colors = settings.themeMode === "auto"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? THEME_PRESETS.dark?.defaults : THEME_PRESETS.light?.defaults)
        : settings.colors[settings.themeMode];
      if (!colors) return;
      const root = document.documentElement;
      Object.entries(colors).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
    }
    applyColors();
    if (settings.themeMode === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", applyColors);
      return () => mq.removeEventListener("change", applyColors);
    }
  }, [settings.themeMode, settings.colors]);
  function updateSetting(key, value) { setSettings(prev => ({ ...prev, [key]: value })); }

  // ── tri-state filters ────────────────────────────────────────────────────────
  useEffect(() => { writeFilterCookie(activeFilters); }, [activeFilters]);
  function cycleFilter(f) {
    setActiveFilters(prev => {
      const next = { ...prev };
      if (!next[f])                   next[f] = "include";
      else if (next[f] === "include") next[f] = "exclude";
      else                            delete next[f];
      return next;
    });
  }



  const { visibleFavorites, visibleOk, visibleCooldown, visibleBanned } = useMemo(() => {
    const currentWeek      = getCurrentWeekStart();
    const hasStatusInclude = ["ok", "cooldown", "banned"].some(f => activeFilters[f] === "include");
    function sectionVisible(key) {
      if (activeFilters[key] === "include") return true;
      if (activeFilters[key] === "exclude") return false;
      return !hasStatusInclude;
    }
    function applyFilters(list) {
      return list.filter(a => {
        if (activeFilters.prime === "include" && !a.prime) return false;
        if (activeFilters.prime === "exclude" && a.prime) return false;
        if (activeFilters.premierReady === "include" && !a.premierReady) return false;
        if (activeFilters.premierReady === "exclude" && a.premierReady) return false;
        if (activeFilters.drop) {
          const hasDrop = (a.weeklyDrops || []).some(d => d.weekStart === currentWeek);
          if (settings.dropEligibleOnly) {
            const nextReset = new Date(currentWeek).getTime() + 7 * 24 * 60 * 60 * 1000;
            const isBanned  = a.vacBanned || a.gameBans > 0;
            const cdBlocks  = a.expires && !isExpired(a.expires) && new Date(a.expires).getTime() > nextReset;
            if (!(a.prime && !isBanned && !cdBlocks)) return false;
          }
          if (activeFilters.drop === "include" && !hasDrop) return false;
          if (activeFilters.drop === "exclude" && hasDrop) return false;
        }
        return true;
      });
    }
    const sort = list => {
      if (settings.sortField === "custom") {
        const allIds = accounts.map(a => a.id);
        const order = [...(settings.customOrder || [])];
        for (const id of allIds) if (!order.includes(id)) order.push(id);
        return [...list].sort((a, b) => {
          const ai = order.indexOf(a.id);
          const bi = order.indexOf(b.id);
          return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
        });
      }
      return sortAccounts(list, settings.sortField, settings.sortDir);
    };
    return {
      visibleFavorites: sort(favorites),
      visibleOk:        sectionVisible("ok")      ? sort(applyFilters(ok))        : [],
      visibleCooldown:  sectionVisible("cooldown") ? sort(applyFilters(onCooldown)): [],
      visibleBanned:    sectionVisible("banned")   ? sort(applyFilters(banned))    : [],
    };
  }, [ok, onCooldown, banned, favorites, activeFilters, settings.dropEligibleOnly, settings.sortField, settings.sortDir, settings.customOrder, accounts]);

  const allVisible = useMemo(() => {
    const secs = [
      { key: "Favorites",   list: visibleFavorites },
      { key: "Available",   list: visibleOk        },
      { key: "On Cooldown", list: visibleCooldown  },
      { key: "Banned",      list: visibleBanned    },
    ];
    return secs
      .filter(s => !collapsedSections[s.key])
      .flatMap(s => s.list);
  }, [visibleFavorites, visibleOk, visibleCooldown, visibleBanned, collapsedSections]);

  useEffect(() => { allVisibleRef.current = allVisible; }, [allVisible]);
  useEffect(() => { setFocusedIdx(-1); }, [search, accounts.length]);

  function navigateSpatial(dir) {
    const all = allVisibleRef.current;
    if (!all.length) return;

    // If nothing focused yet, start at the first card
    if (focusedIdxRef.current < 0) { setFocusedIdx(0); return; }

    const focusedAcc = all[focusedIdxRef.current];
    const focusedEl  = focusedAcc
      ? document.querySelector(`[data-account-id="${focusedAcc.id}"]`)
      : null;
    if (!focusedEl) { setFocusedIdx(0); return; }

    const fr = focusedEl.getBoundingClientRect();
    const fcx = fr.left + fr.width  / 2;
    const fcy = fr.top  + fr.height / 2;

    let bestId = null, bestDist = Infinity;

    for (const el of document.querySelectorAll("[data-account-id]")) {
      if (el === focusedEl) continue;
      const r   = el.getBoundingClientRect();
      const cx  = r.left + r.width  / 2;
      const cy  = r.top  + r.height / 2;
      const dx  = cx - fcx, dy = cy - fcy;

      // Must be in the right direction with a small threshold to ignore same-row/col noise
      const THRESH = 8;
      let valid = false, dist = 0;
      if (dir === "right") { valid = dx >  THRESH; dist = Math.hypot(dx, dy * 3); }
      if (dir === "left")  { valid = dx < -THRESH; dist = Math.hypot(dx, dy * 3); }
      if (dir === "down")  { valid = dy >  THRESH; dist = Math.hypot(dy, dx * 3); }
      if (dir === "up")    { valid = dy < -THRESH; dist = Math.hypot(dy, dx * 3); }

      if (valid && dist < bestDist) { bestDist = dist; bestId = el.getAttribute("data-account-id"); }
    }

    if (bestId) {
      const idx = all.findIndex(a => a.id === bestId);
      if (idx >= 0) setFocusedIdx(idx);
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === "/" && !inInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (inInput) return;

      if (e.key === "Escape") {
        setFocusedIdx(-1);
        searchRef.current?.blur();
        return;
      }
      const dirMap = { ArrowRight: "right", ArrowLeft: "left", ArrowDown: "down", ArrowUp: "up", l: "right", h: "left", j: "down", k: "up" };
      if (dirMap[e.key]) {
        e.preventDefault();
        navigateSpatial(dirMap[e.key]);
        return;
      }
      if (e.key === "Enter") {
        const acc = allVisibleRef.current[focusedIdxRef.current];
        if (acc) handleSwitch(acc.id);
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (focusedIdx < 0) return;
    const acc = allVisible[focusedIdx];
    if (!acc) return;
    document.querySelector(`[data-account-id="${acc.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx]);

  return (
    <div className={styles.layout}>
      {/* ── sidebar ── */}
      <aside className={`${styles.sidebar} ${settings.sidebarCollapsed ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>▣</span>
            {!settings.sidebarCollapsed && <span className={styles.logoText}>STEAM<br /><em>MANAGER</em></span>}
          </div>
          {!settings.sidebarCollapsed && (
            <button data-notif-trigger className={`${styles.notifHeaderBtn} ${styles.notifGearBtn}`} onClick={handleToggleNotif} title="Notifications">
              <BellIcon size={16} />
              {notifications.length > 0 && <span className={styles.notifBadge}>{notifications.length > 99 ? "99+" : notifications.length}</span>}
            </button>
          )}
        </div>

        <DropCountdown collapsed={settings.sidebarCollapsed} />

        <button className={styles.addBtn} onClick={() => setModal({ mode: "add" })}>
          {settings.sidebarCollapsed ? <PlusIcon size={18} /> : <><PlusIcon size={13} /> Add Account</>}
        </button>

        <button
          className={styles.refreshAllBtn}
          onClick={handleRefreshAll}
          disabled={refreshingAll}
          title={lastRefreshed ? `Last refreshed: ${lastRefreshed.toLocaleTimeString()}` : "Refresh all Steam stats"}
        >
          {settings.sidebarCollapsed
            ? <span className={`${styles.iconWrap} ${refreshingAll ? styles.iconWrapSpin : ""}`}><RefreshIcon size={18} /></span>
            : (refreshingAll ? "Refreshing…" : <><RefreshIcon size={13} />{"  Refresh All"}</>)}
        </button>
        {refreshingAll && !settings.sidebarCollapsed && (
          <div className={styles.refreshProgressBar}>
            <div className={styles.refreshProgressFill} />
          </div>
        )}

        {settings.sidebarCollapsed ? (
          <>
            <button className={styles.gearBtn} onClick={() => setWatchlistOpen(true)} title="Ban Watcher"><FlagIcon size={18} /></button>
            <button data-notif-trigger className={`${styles.gearBtn} ${styles.notifGearBtn}`} onClick={handleToggleNotif} title="Notifications">
              <BellIcon size={18} />
              {notifications.length > 0 && <span className={styles.notifBadge}>{notifications.length > 99 ? "99+" : notifications.length}</span>}
            </button>
            <button className={styles.gearBtn} onClick={() => setSettingsOpen(true)} title="Settings"><SettingsIcon size={18} /></button>
          </>
        ) : (
          <div className={styles.sidebarIconRow}>
            <button className={styles.sidebarIconBtn} onClick={() => setWatchlistOpen(true)} title="Ban Watcher"><FlagIcon size={14} /> Ban Watcher</button>
            <button className={styles.sidebarIconBtn} onClick={() => setSettingsOpen(true)} title="Settings"><SettingsIcon size={14} /> Settings</button>
          </div>
        )}

        <button
          className={styles.collapseBtn}
          onClick={() => updateSetting("sidebarCollapsed", !settings.sidebarCollapsed)}
          title={settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >{settings.sidebarCollapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}</button>
      </aside>

      {/* ── main ── */}
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Accounts</h1>
          {error && <span className={styles.serverErr}>{error}</span>}
        </header>

        {loading ? (
          <p className={styles.empty}>Loading…</p>
        ) : accounts.length === 0 ? (
          <p className={styles.empty}>No accounts yet — click "+ Add Account" to get started.</p>
        ) : (
          <>
            <div className={styles.toolbar}>
              <input
                ref={searchRef}
                className={styles.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, alias, or Steam ID…  ( / )"
                onKeyDown={e => e.key === "Escape" && (e.target.blur(), setSearch(""))}
              />
              <div className={styles.sortControls}>
                <select
                  className={styles.sortSelect}
                  value={settings.sortField}
                  onChange={e => updateSetting("sortField", e.target.value)}
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {settings.sortField !== "custom" && (
                  <button
                    className={styles.sortDirBtn}
                    onClick={() => updateSetting("sortDir", settings.sortDir === "asc" ? "desc" : "asc")}
                    title={settings.sortDir === "asc" ? "Ascending" : "Descending"}
                  >{settings.sortDir === "asc" ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}</button>
                )}
              </div>
            </div>
            <div className={styles.filterBar}>
              {[
                { key: "ok",           label: "Available", color: "var(--green)"  },
                { key: "cooldown",     label: "Cooldown",  color: "var(--yellow)" },
                { key: "banned",       label: "Banned",    color: "var(--red)"    },
                { key: "prime",        label: "Prime",     color: "#e8b53a"       },
                { key: "premierReady", label: "Premier",   color: "#4db6e8"       },
                { key: "drop",         label: "Drop",      color: "#6dbf8a"       },
              ].map(({ key, label, color }) => {
                const state = activeFilters[key];
                return (
                  <button
                    key={key}
                    className={`${styles.filterChip} ${state === "include" ? styles.filterChipOn : state === "exclude" ? styles.filterChipExclude : ""}`}
                    style={{ "--chip-color": color }}
                    onClick={() => cycleFilter(key)}
                    title={state === "include" ? `Showing: ${label}` : state === "exclude" ? `Hiding: ${label}` : label}
                  >{label}</button>
                );
              })}
            </div>

            {(() => {
              const focusedId = allVisible[focusedIdx]?.id;
              const isDraggable = settings.sortField === "custom";
              const cardStrategy = settings.cardLayout === "list" ? verticalListSortingStrategy : rectSortingStrategy;
              const activeAcc = activeId ? accounts.find(a => a.id === activeId) : null;

              const DEFAULT_SECTION_ORDER = ["Favorites", "Available", "On Cooldown", "Banned"];
              const sectionOrder = settings.sectionOrder || DEFAULT_SECTION_ORDER;

              const allSections = [
                { key: "Favorites",   accent: "#f9e2af",        list: visibleFavorites, extra: {} },
                { key: "Available",   accent: "var(--green)",   list: visibleOk,        extra: {} },
                { key: "On Cooldown", accent: "var(--yellow)",  list: visibleCooldown,  extra: {} },
                { key: "Banned",      accent: "var(--red)",     list: visibleBanned,    extra: { banned: true } },
              ].sort((a, b) => sectionOrder.indexOf(a.key) - sectionOrder.indexOf(b.key));

              const cardProps = (a, extra = {}) => ({
                key: a.id,
                acc: a,
                layout: settings.cardLayout,
                active: activeAccount && a.name.toLowerCase() === activeAccount.toLowerCase(),
                isFocused: focusedId === a.id,
                showSteamId: settings.showSteamId,
                showLoginName: settings.showLoginName,
                showPlaytime: settings.showPlaytime,
                showPrimeBadge: settings.showPrimeBadge,
                showPremierBadge: settings.showPremierBadge,
                onEdit: () => setModal({ mode: "edit", acc: a }),
                onRefresh: handleRefresh,
                onSwitch: handleSwitch,
                onHistory: () => setHistoryAcc(a),
                onToggleDrop: handleToggleDrop,
                onDropHistory: () => setDropHistoryAcc(a),
                onSetCooldown: handleSetCooldown,
                onClearCooldown: handleClearCooldown,
                onToggleFavorite: handleToggleFavorite,
                onStats: setStatsAcc,
                hasLeetify: !!leetifyCache[a.id],
                draggable: isDraggable,
                ...extra,
              });

              const activeSec = activeSectionId ? allSections.find(s => s.key === activeSectionId) : null;

              return (
                // Outer context — section reordering only.
                // Section's useSortable sees this as the nearest ancestor ✓
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={({ active }) => setActiveSectionId(active.id)}
                  onDragEnd={({ active, over }) => {
                    setActiveSectionId(null);
                    if (!over || active.id === over.id) return;
                    setSettings(prev => {
                      const order = [...(prev.sectionOrder || DEFAULT_SECTION_ORDER)];
                      const from = order.indexOf(active.id);
                      const to   = order.indexOf(over.id);
                      if (from === -1 || to === -1) return prev;
                      order.splice(from, 1);
                      order.splice(to, 0, active.id);
                      return { ...prev, sectionOrder: order };
                    });
                  }}
                >
                  <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                    {allSections.map(({ key, accent, list, extra }) =>
                      list.length > 0 && (
                        // Inner context is a CHILD of Section, not a parent.
                        // AccountCard's useSortable sees this inner context ✓
                        <Section key={key} id={key} title={key} accent={accent} layout={settings.cardLayout}
                          count={list.length} collapsed={!!collapsedSections[key]} onToggle={() => toggleSection(key)}>
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                          >
                            <SortableContext items={list.map(a => a.id)} strategy={cardStrategy}>
                              {list.map(a => <AccountCard {...cardProps(a, extra)} />)}
                            </SortableContext>
                            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
                              {activeAcc ? <AccountCard {...cardProps(activeAcc)} draggable={false} isDragOverlay /> : null}
                            </DragOverlay>
                          </DndContext>
                        </Section>
                      )
                    )}
                  </SortableContext>
                  {/* Section drag overlay — just the title pill, not the cards */}
                  <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
                    {activeSec ? (
                      <div className={styles.sectionDragOverlay}>
                        <span className={styles.sectionTitle} style={{ color: activeSec.accent }}>
                          {activeSec.key}
                          <span className={styles.sectionCount}>({activeSec.list.length})</span>
                        </span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              );
            })()}
          </>
        )}
      </main>

      {/* ── modal ── */}
      {modal && (
        <AccountModal
          mode={modal.mode}
          acc={modal.acc}
          onClose={() => setModal(null)}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {historyAcc && (
        <CooldownHistoryModal acc={historyAcc} onClose={() => setHistoryAcc(null)}
          onDeleteEntry={(i) => handleDeleteHistoryEntry(historyAcc.id, i)} />
      )}
      {dropHistoryAcc && (
        <DropHistoryModal acc={dropHistoryAcc} onClose={() => setDropHistoryAcc(null)} />
      )}
      {statsAcc && (
        <LeetifyModal acc={statsAcc} onClose={() => setStatsAcc(null)} />
      )}
      {notifOpen && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setNotifOpen(false)}
          onClearAll={handleClearAllNotifs}
          onDismiss={handleDismissNotif}
          anchor={notifAnchor}
        />
      )}
      {watchlistOpen && (
        <WatchlistPanel
          watchlist={watchlist}
          onClose={() => setWatchlistOpen(false)}
          onAdd={handleAddWatch}
          onRemove={handleRemoveWatch}
          onCheckAll={handleCheckAllWatch}
          checking={watchChecking}
        />
      )}
      {settingsOpen && (
        <SettingsModal settings={settings} onChange={updateSetting} onClose={() => setSettingsOpen(false)}
          keyDraft={keyDraft} onKeyDraftChange={setKeyDraft} onSaveKey={handleSaveKey} apiKey={apiKey}
          leetifyDraft={leetifyDraft} onLeetifyDraftChange={setLeetifyDraft} onSaveLeetifyKey={handleSaveLeetifyKey} leetifyKey={leetifyKey}
          onClearCache={handleClearCache} />
      )}
      <div className={styles.toastContainer}>
        {toasts.map(t => (
          <div key={t.id} className={`${styles.toast} ${t.type === "error" ? styles.toastError : t.type === "success" ? styles.toastSuccess : styles.toastInfo}`}>
            <span>{t.message}</span>
            <button className={styles.toastClose} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}><CloseIcon size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
