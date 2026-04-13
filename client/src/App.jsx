import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { parseDuration, remainingStr, isExpired, getCurrentWeekStart } from "./cooldown.js";
import styles from "./App.module.css";

const API = "/api/accounts";

const FILTER_COOKIE = "sm_filters";
const SETTINGS_KEY  = "sm_settings";

const CATPPUCCIN_MOCHA = {
  "bg": "#1e1e2e", "surface": "#181825", "card": "#232336", "card-h": "#2a2b40",
  "border": "#313244", "accent": "#89b4fa", "accent-d": "#74c7ec",
  "green": "#a6e3a1", "yellow": "#f9e2af", "red": "#f38ba8",
  "text": "#cdd6f4", "dim": "#6c7086", "muted": "#585b70",
};
const CATPPUCCIN_LATTE = {
  "bg": "#e6e9ef", "surface": "#dce0e8", "card": "#eff1f5", "card-h": "#ccd0da",
  "border": "#bcc0cc", "accent": "#1e66f5", "accent-d": "#209fb5",
  "green": "#40a02b", "yellow": "#df8e1d", "red": "#d20f39",
  "text": "#4c4f69", "dim": "#6c6f85", "muted": "#acb0be",
};
const OLED_DARK = {
  "bg": "#000000", "surface": "#000000", "card": "#141414", "card-h": "#1e1e1e",
  "border": "#2e2e2e", "accent": "#00d4ff", "accent-d": "#bf5fff",
  "green": "#00ff87", "yellow": "#ffe600", "red": "#ff2d55",
  "text": "#ffffff", "dim": "#888888", "muted": "#4a4a4a",
};

const THEME_PRESETS = {
  dark:  { label: "Catppuccin Mocha", defaults: CATPPUCCIN_MOCHA },
  light: { label: "Catppuccin Latte", defaults: CATPPUCCIN_LATTE },
  oled:  { label: "OLED Dark",        defaults: OLED_DARK },
};
const COLOR_LABELS = [
  ["bg", "Background"], ["surface", "Sidebar"],
  ["card", "Card"], ["card-h", "Card hover"],
  ["border", "Border"], ["accent", "Accent"],
  ["accent-d", "Accent dark"], ["text", "Text"],
  ["dim", "Dim text"], ["muted", "Muted"],
  ["green", "Green"], ["yellow", "Yellow"],
  ["red", "Red"],
];

const DEFAULT_SETTINGS = {
  showPrimeBadge: true,
  showPremierBadge: true,
  dropEligibleOnly: true,
  showSteamId: true,
  showLoginName: true,
  showPlaytime: true,
  cardLayout: "grid",
  sortField: "createdAt",
  sortDir: "desc",
  themeMode: "dark",
  colors: { dark: { ...CATPPUCCIN_MOCHA }, light: { ...CATPPUCCIN_LATTE }, oled: { ...OLED_DARK } },
};

function readSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      colors: Object.fromEntries(
        Object.entries(THEME_PRESETS).map(([key, { defaults }]) => [
          key, { ...defaults, ...(parsed.colors?.[key] || {}) },
        ])
      ),
    };
  } catch { return DEFAULT_SETTINGS; }
}
function readFilterCookie() {
  const entry = document.cookie.split("; ").find(c => c.startsWith(`${FILTER_COOKIE}=`));
  if (!entry) return {};
  try { return JSON.parse(decodeURIComponent(entry.split("=")[1])); }
  catch { return {}; }
}
function writeFilterCookie(filters) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${FILTER_COOKIE}=${encodeURIComponent(JSON.stringify(filters))}; expires=${expires}; path=/`;
}


const SORT_OPTIONS = [
  { value: "createdAt",     label: "Date Added"     },
  { value: "name",          label: "Name"            },
  { value: "cs2Hours",      label: "Playtime"        },
  { value: "premierRating", label: "Premier Rating"  },
  { value: "steamId64",     label: "Steam ID"        },
];

function sortAccounts(list, field, dir) {
  return [...list].sort((a, b) => {
    let av, bv;
    if (field === "name") {
      av = (a.alias || a.profileName || a.name || "").toLowerCase();
      bv = (b.alias || b.profileName || b.name || "").toLowerCase();
    } else if (field === "createdAt") {
      av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    } else if (field === "cs2Hours") {
      av = a.cs2Hours ?? -1;
      bv = b.cs2Hours ?? -1;
    } else if (field === "premierRating") {
      av = a.premierRating ?? -1;
      bv = b.premierRating ?? -1;
    } else if (field === "steamId64") {
      av = a.steamId64 || "";
      bv = b.steamId64 || "";
    } else {
      return 0;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [modal, setModal]         = useState(null);
  const [historyAcc, setHistoryAcc] = useState(null);
  const [dropHistoryAcc, setDropHistoryAcc] = useState(null);
  const [apiKey, setApiKey]       = useState("");
  const [keyDraft, setKeyDraft]   = useState("");
  const [activeAccount, setActiveAccount] = useState(null); // login name of currently active Steam account
  const [search, setSearch]               = useState("");
  const [activeFilters, setActiveFilters] = useState(() => readFilterCookie());
  const [settings, setSettings]           = useState(() => readSettings());
  const [settingsOpen, setSettingsOpen]   = useState(false);

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

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(cfg => {
      setApiKey(cfg.steamApiKey || "");
      setKeyDraft(cfg.steamApiKey || "");
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
    const r = await fetch(`/api/switch/${id}`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) {
      alert(`Switch failed: ${data.error}`);
    }
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

  const { banned, onCooldown, ok } = useMemo(() => {
    const banned    = searched.filter(a => a.vacBanned || a.gameBans > 0);
    const bannedIds = new Set(banned.map(a => a.id));
    return {
      banned,
      onCooldown: searched.filter(a => !bannedIds.has(a.id) && a.expires && !isExpired(a.expires)),
      ok:         searched.filter(a => !bannedIds.has(a.id) && (!a.expires || isExpired(a.expires))),
    };
  }, [searched]);

  // ── settings persistence + theme apply ───────────────────────────────────────
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    const colors = settings.colors[settings.themeMode];
    const root = document.documentElement;
    Object.entries(colors).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
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



  const { visibleOk, visibleCooldown, visibleBanned } = useMemo(() => {
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
    const sort = list => sortAccounts(list, settings.sortField, settings.sortDir);
    return {
      visibleOk:       sectionVisible("ok")      ? sort(applyFilters(ok))        : [],
      visibleCooldown: sectionVisible("cooldown") ? sort(applyFilters(onCooldown)): [],
      visibleBanned:   sectionVisible("banned")   ? sort(applyFilters(banned))    : [],
    };
  }, [ok, onCooldown, banned, activeFilters, settings.dropEligibleOnly, settings.sortField, settings.sortDir]);

  return (
    <div className={styles.layout}>
      {/* ── sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>▣</span>
            <span className={styles.logoText}>STEAM<br /><em>MANAGER</em></span>
          </div>
          <button className={styles.gearBtn} onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        </div>

        <div className={styles.stats}>
          <Stat label="Total" value={accounts.length} />
          <Stat label="OK" value={ok.length} color="var(--green)" />
          <Stat label="Cooldown" value={onCooldown.length} color="var(--yellow)" />
        </div>

        <DropCountdown />

        <button className={styles.addBtn} onClick={() => setModal({ mode: "add" })}>
          + Add Account
        </button>

      </aside>

      {/* ── main ── */}
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Accounts</h1>
          {error && <span className={styles.serverErr}>{error}</span>}
          <input
            className={styles.searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, alias, or Steam ID…"
          />
        </header>

        {loading ? (
          <p className={styles.empty}>Loading…</p>
        ) : accounts.length === 0 ? (
          <p className={styles.empty}>No accounts yet — click "+ Add Account" to get started.</p>
        ) : (
          <>
            <div className={styles.filterBar}>
              {[
                { key: "ok",           label: "Available",       color: "var(--green)"  },
                { key: "cooldown",     label: "Cooldown", color: "var(--yellow)" },
                { key: "banned",       label: "Banned",   color: "var(--red)"    },
                { key: "prime",        label: "Prime",    color: "#e8b53a"       },
                { key: "premierReady", label: "Premier",  color: "#4db6e8"       },
                { key: "drop",         label: "Drop",     color: "#6dbf8a"       },
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
              <div className={styles.sortControls}>
                <select
                  className={styles.sortSelect}
                  value={settings.sortField}
                  onChange={e => updateSetting("sortField", e.target.value)}
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  className={styles.sortDirBtn}
                  onClick={() => updateSetting("sortDir", settings.sortDir === "asc" ? "desc" : "asc")}
                  title={settings.sortDir === "asc" ? "Ascending" : "Descending"}
                >{settings.sortDir === "asc" ? "↑" : "↓"}</button>
              </div>
            </div>

            {visibleOk.length > 0 && (
              <Section title="Available" accent="var(--green)" layout={settings.cardLayout}>
                {visibleOk.map(a =>
                  <AccountCard key={a.id} acc={a} layout={settings.cardLayout}
                    active={activeAccount && a.name.toLowerCase() === activeAccount.toLowerCase()}
                    showSteamId={settings.showSteamId}
                    showLoginName={settings.showLoginName}
                    showPlaytime={settings.showPlaytime}
                    showPrimeBadge={settings.showPrimeBadge}
                    showPremierBadge={settings.showPremierBadge}
                    onEdit={() => setModal({ mode: "edit", acc: a })}
                    onRefresh={handleRefresh}
                    onSwitch={handleSwitch}
                    onHistory={() => setHistoryAcc(a)}
                    onToggleDrop={handleToggleDrop}
                    onDropHistory={() => setDropHistoryAcc(a)}
                    onSetCooldown={handleSetCooldown}
                    onClearCooldown={handleClearCooldown} />
                )}
              </Section>
            )}
            {visibleCooldown.length > 0 && (
              <Section title="On Cooldown" accent="var(--yellow)" layout={settings.cardLayout}>
                {visibleCooldown.map(a =>
                  <AccountCard key={a.id} acc={a} layout={settings.cardLayout}
                    active={activeAccount && a.name.toLowerCase() === activeAccount.toLowerCase()}
                    showSteamId={settings.showSteamId}
                    showLoginName={settings.showLoginName}
                    showPlaytime={settings.showPlaytime}
                    showPrimeBadge={settings.showPrimeBadge}
                    showPremierBadge={settings.showPremierBadge}
                    onEdit={() => setModal({ mode: "edit", acc: a })}
                    onRefresh={handleRefresh}
                    onSwitch={handleSwitch}
                    onHistory={() => setHistoryAcc(a)}
                    onToggleDrop={handleToggleDrop}
                    onDropHistory={() => setDropHistoryAcc(a)}
                    onSetCooldown={handleSetCooldown}
                    onClearCooldown={handleClearCooldown} />
                )}
              </Section>
            )}
            {visibleBanned.length > 0 && (
              <Section title="Banned" accent="var(--red)" layout={settings.cardLayout}>
                {visibleBanned.map(a =>
                  <AccountCard key={a.id} acc={a} banned layout={settings.cardLayout}
                    active={activeAccount && a.name.toLowerCase() === activeAccount.toLowerCase()}
                    showSteamId={settings.showSteamId}
                    showLoginName={settings.showLoginName}
                    showPlaytime={settings.showPlaytime}
                    showPrimeBadge={settings.showPrimeBadge}
                    showPremierBadge={settings.showPremierBadge}
                    onEdit={() => setModal({ mode: "edit", acc: a })}
                    onRefresh={handleRefresh}
                    onSwitch={handleSwitch}
                    onHistory={() => setHistoryAcc(a)}
                    onToggleDrop={handleToggleDrop}
                    onDropHistory={() => setDropHistoryAcc(a)}
                    onSetCooldown={handleSetCooldown}
                    onClearCooldown={handleClearCooldown} />
                )}
              </Section>
            )}
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
      {settingsOpen && (
        <SettingsModal settings={settings} onChange={updateSetting} onClose={() => setSettingsOpen(false)}
          keyDraft={keyDraft} onKeyDraftChange={setKeyDraft} onSaveKey={handleSaveKey} apiKey={apiKey} />
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

function AccountModal({ mode, acc, onClose, onAdd, onEdit, onDelete }) {
  const isEdit = mode === "edit";

  const [name, setName]             = useState(isEdit ? acc.name         : "");
  const [alias, setAlias]           = useState(isEdit ? acc.alias        : "");
  const [prime, setPrime]           = useState(isEdit ? !!acc.prime      : false);
  const [premierReady, setPremierReady] = useState(isEdit ? !!acc.premierReady : false);
  const [premierRating, setPremierRating] = useState(isEdit && acc.premierRating != null ? String(acc.premierRating) : "");
  const [password, setPassword]     = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [cooldown, setCooldown]     = useState("");
  const [formErr, setFormErr]       = useState("");
  const [busy, setBusy]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormErr("");
    if (!name.trim()) { setFormErr("Login name is required"); return; }

    let expires = undefined; // undefined = don't change (edit mode)
    if (cooldown.trim()) {
      expires = parseDuration(cooldown.trim());
      if (!expires) { setFormErr("Bad format — try  20h  3d  2w  45m"); return; }
    } else if (!isEdit) {
      expires = null; // add mode with no cooldown
    }

    setBusy(true);
    const ratingVal = premierRating.trim() === "" ? null : parseInt(premierRating, 10);
    const payload = {
      name: name.trim(),
      alias: alias.trim(),
      prime,
      premierReady,
      premierRating: ratingVal,
      ...(password.trim() && { password: password.trim() }),
      ...(profileUrl.trim() && { profileUrl: profileUrl.trim() }),
      ...(expires !== undefined && { expires }),
      ...(expires != null && cooldown.trim() && { cooldownInput: cooldown.trim() }),
    };

    if (isEdit) {
      await onEdit(acc.id, payload);
    } else {
      await onAdd(payload);
    }
    setBusy(false);
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{isEdit ? "Edit Account" : "Add Account"}</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Login / Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
                 placeholder="e.g. 3039554938a" autoComplete="off" autoFocus />

          <label className={styles.label}>Alias <span>(optional)</span></label>
          <input value={alias} onChange={e => setAlias(e.target.value)}
                 placeholder="e.g. Gangster" autoComplete="off" />

          <div className={styles.toggleGroup}>
            <Toggle label="CS2 Prime" subtitle="Prime status activated"
              checked={prime} onChange={setPrime} icon={<PrimeIcon />} />
            <Toggle label="Premier Ready" subtitle="Account is level 10+"
              checked={premierReady} onChange={setPremierReady} icon={<PremierIcon />} />
          </div>

          <label className={styles.label}>Premier Rating <span>(optional — e.g. 15250)</span></label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              value={premierRating}
              onChange={e => setPremierRating(e.target.value.replace(/\D/g, ""))}
              placeholder="0 – 35000"
              autoComplete="off"
              style={{ flex: 1 }}
            />
            {premierRating.trim() !== "" && !isNaN(parseInt(premierRating, 10)) && (
              <PremierRatingBadge rating={parseInt(premierRating, 10)} />
            )}
          </div>

          <label className={styles.label}>
            Password <span>({isEdit ? (acc.hasPassword ? "stored — leave blank to keep" : "not set") : "optional"})</span>
          </label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                 placeholder={isEdit && acc.hasPassword ? "••••••••" : "Steam password"} autoComplete="new-password" />

          <label className={styles.label}>Steam Profile URL <span>(optional)</span></label>
          <input value={profileUrl} onChange={e => setProfileUrl(e.target.value)}
                 placeholder="steamcommunity.com/id/…" autoComplete="off" />

          <label className={styles.label}>
            {isEdit ? "New Cooldown" : "Cooldown"} <span>(optional{isEdit ? ", leave blank to keep current" : ""})</span>
          </label>
          <input value={cooldown} onChange={e => setCooldown(e.target.value)}
                 placeholder="20h · 3d · 2w · 45m" autoComplete="off" />

          {isEdit && acc.expires && !isExpired(acc.expires) && (
            <p className={styles.cdNote}>Current: {remainingStr(acc.expires)} remaining</p>
          )}

          {formErr && <p className={styles.formErr}>{formErr}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.addBtn} disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save" : "Add Account"}
            </button>
          </div>

          {!isEdit && (
            <div className={styles.hint}>
              <p>m = minutes &nbsp;·&nbsp; h = hours</p>
              <p>d = days &nbsp;·&nbsp; w = weeks</p>
            </div>
          )}
        </form>

        {isEdit && (
          <div className={styles.dangerZone}>
            {confirmDelete ? (
              <>
                <span className={styles.dangerLabel}>Are you sure?</span>
                <button className={styles.dangerConfirm} onClick={() => onDelete(acc.id)}>Delete</button>
                <button className={styles.dangerCancel} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button className={styles.dangerTrigger} onClick={() => setConfirmDelete(true)}>
                Delete account
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Supporting components ─────────────────────────────────────────────────────

function Section({ title, accent, children, layout }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontFamily: "var(--mono)", fontSize: "11px", letterSpacing: "0.12em",
                   color: accent, marginBottom: "10px", textTransform: "uppercase" }}>
        {title}
      </h2>
      <div className={layout === "list" ? styles.cardGridList : styles.cardGrid}>{children}</div>
    </section>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "26px", fontWeight: 800,
                    color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "10px", color: "var(--dim)",
                    fontFamily: "var(--mono)", letterSpacing: "0.1em" }}>{label}</div>
    </div>
  );
}

function AccountCard({ acc, onEdit, onRefresh, onSwitch, onHistory, onToggleDrop, onDropHistory, onSetCooldown, onClearCooldown, banned, active, layout = "grid", showSteamId = true, showLoginName = true, showPlaytime = true, showPrimeBadge = true, showPremierBadge = true }) {
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
          <Badge color="var(--yellow)" bg="color-mix(in srgb, var(--yellow) 12%, transparent)">⏳ Cooldown</Badge>
          <span className={styles.remaining}>{rem}</span>
        </>
      )}
    </div>
  );

  const ctxMenuEl = ctxPos && (
    <div ref={ctxRef} className={styles.ctxMenu} style={{ top: ctxPos.y, left: ctxPos.x }}>
      {acc.steamId64 && (
        <button className={styles.ctxItem} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "↺  Refresh"}
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

  const baseClass = `${styles.card} ${hasCd ? styles.cardCd : ""} ${banned ? styles.cardBanned : ""} ${active ? styles.cardActive : ""}`;

  if (layout === "list") {
    return (
      <div className={`${baseClass} ${styles.cardList}`} onContextMenu={handleContextMenu}>
        {acc.avatar && <img src={acc.avatar} alt="" className={styles.avatar} />}
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
                      onClick={() => { setCdOpen(false); setCdInput(""); setCdErr(false); }}>✕</button>
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
        <div className={styles.cardHoverHint}>right-click</div>
        {ctxMenuEl}
      </div>
    );
  }

  // grid layout (vertical card)
  return (
    <div className={baseClass} onContextMenu={handleContextMenu}>
      <div className={styles.cardTop}>
        {acc.avatar && <img src={acc.avatar} alt="" className={styles.avatar} />}
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
                      onClick={() => { setCdOpen(false); setCdInput(""); setCdErr(false); }}>✕</button>
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
      <div className={styles.cardHoverHint}>right-click</div>
      {ctxMenuEl}
    </div>
  );
}

function Badge({ color, bg, children }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: "4px",
      fontSize: "11px", fontFamily: "var(--mono)", fontWeight: 600,
      color, background: bg, letterSpacing: "0.05em"
    }}>{children}</span>
  );
}

function Toggle({ label, subtitle, icon, checked, onChange }) {
  return (
    <div className={`${styles.toggleRow} ${checked ? styles.toggleRowOn : ""}`}
         onClick={() => onChange(!checked)} role="button" tabIndex={0}
         onKeyDown={e => e.key === " " && onChange(!checked)}>
      <div className={styles.toggleIcon}>{icon}</div>
      <div className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {subtitle && <span className={styles.toggleSub}>{subtitle}</span>}
      </div>
      <div className={`${styles.toggleTrack} ${checked ? styles.toggleTrackOn : ""}`}>
        <div className={styles.toggleThumb} />
      </div>
    </div>
  );
}

function PrimeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polygon points="8,1 10.2,6 15.5,6.5 11.5,10 12.8,15.5 8,12.5 3.2,15.5 4.5,10 0.5,6.5 5.8,6"
        fill="#e8b53a" />
    </svg>
  );
}

function premierTierColor(rating) {
  if (rating >= 30000) return "#f0c030";
  if (rating >= 25000) return "#eb4b4b";
  if (rating >= 20000) return "#d32ce6";
  if (rating >= 15000) return "#8847ff";
  if (rating >= 10000) return "#4b69ff";
  if (rating >= 5000)  return "#5e98d9";
  return "#b0c3d9";
}

function premierTierDarkBg(rating) {
  if (rating >= 30000) return "#1a1400";
  if (rating >= 25000) return "#1a0505";
  if (rating >= 20000) return "#160520";
  if (rating >= 15000) return "#0d0520";
  if (rating >= 10000) return "#05051a";
  if (rating >= 5000)  return "#051018";
  return "#0d1015";
}

function PremierRatingBadge({ rating }) {
  const color = premierTierColor(rating);
  const bg    = premierTierDarkBg(rating);
  const main  = rating >= 1000
    ? `${Math.floor(rating / 1000).toLocaleString()},`
    : String(rating);
  const sub   = rating >= 1000
    ? String(rating % 1000).padStart(3, "0")
    : null;
  return (
    <div style={{ position: "relative", display: "inline-flex", height: 22, aspectRatio: "110/40", flexShrink: 0 }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
           viewBox="0 0 125 40" fill="none" preserveAspectRatio="none">
        <path d="M10.5449 1H118.411C121.468 1.0002 123.809 3.71928 123.355 6.74219L119.155 34.7422C118.788 37.1895 116.686 38.9999 114.211 39H6.34473C3.28805 38.9998 0.946954 36.2807 1.40039 33.2578L5.60059 5.25781C5.96793 2.81051 8.07017 1.00006 10.5449 1Z"
              fill={bg} stroke={color} strokeWidth="2"/>
        <path d="M4.84496 3.40663C5.13867 1.44855 6.82072 0 8.80071 0H13.356L7.35596 40H4.00071C1.55523 40 -0.317801 37.8251 0.0449613 35.4066L4.84496 3.40663Z"
              fill={color}/>
        <path d="M17.2617 0H26.2617L20.2617 40H11.2617L17.2617 0Z" fill={color}/>
      </svg>
      <div style={{ position: "relative", display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingLeft: "18%" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontStyle: "italic", lineHeight: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "var(--mono)" }}>{main}</span>
          {sub && <span style={{ fontSize: 8, fontWeight: 700, color, fontFamily: "var(--mono)" }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function PremierIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polygon points="8,0 9.5,5.5 15,5.5 10.5,9 12,15 8,11.5 4,15 5.5,9 1,5.5 6.5,5.5"
        fill="#4db6e8" />
    </svg>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function CooldownHistoryModal({ acc, onClose, onDeleteEntry }) {
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
          <button className={styles.modalClose} onClick={onClose}>✕</button>
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
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DropCountdown() {
  const [rem, setRem] = useState("");
  useEffect(() => {
    function tick() {
      const weekStart = new Date(getCurrentWeekStart()).getTime();
      const nextReset = weekStart + 7 * 24 * 60 * 60 * 1000;
      const diff = nextReset - Date.now();
      if (diff <= 0) { setRem("Resetting…"); return; }
      const s   = Math.floor(diff / 1000);
      const d   = Math.floor(s / 86400);
      const h   = Math.floor((s % 86400) / 3600);
      const m   = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const parts = [];
      if (d) parts.push(`${d}d`);
      parts.push(`${String(h).padStart(2, "0")}h`);
      parts.push(`${String(m).padStart(2, "0")}m`);
      parts.push(`${String(sec).padStart(2, "0")}s`);
      setRem(parts.join("  "));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.dropCountdown}>
      <span className={styles.dropCountdownLabel}>Next drop reset</span>
      <span className={styles.dropCountdownTime}>{rem}</span>
    </div>
  );
}

function fmtWeek(weekStartIso) {
  const d = new Date(weekStartIso);
  return "Week of " + d.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function DropHistoryModal({ acc, onClose }) {
  const drops = [...(acc.weeklyDrops || [])].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const currentWeek = getCurrentWeekStart();
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            Weekly Drops — {acc.alias || acc.profileName || acc.name}
          </span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
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
    </div>
  );
}

function SettingRow({ label, checked, onChange }) {
  return (
    <div
      className={styles.settingRow}
      onClick={() => onChange(!checked)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === " " && onChange(!checked)}
    >
      <span className={styles.settingRowLabel}>{label}</span>
      <div className={`${styles.settingSwitch} ${checked ? styles.settingSwitchOn : ""}`}>
        <div className={styles.settingSwitchThumb} />
      </div>
    </div>
  );
}

function SettingsModal({ settings, onChange, onClose, keyDraft, onKeyDraftChange, onSaveKey, apiKey }) {
  const [tab, setTab] = useState("display");

  function updateColor(key, value) {
    onChange("colors", {
      ...settings.colors,
      [settings.themeMode]: { ...settings.colors[settings.themeMode], [key]: value },
    });
  }

  function resetTheme() {
    const defaults = THEME_PRESETS[settings.themeMode]?.defaults ?? CATPPUCCIN_MOCHA;
    onChange("colors", { ...settings.colors, [settings.themeMode]: { ...defaults } });
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={`${styles.modal} ${styles.settingsModal}`} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Settings</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.settingsTabs}>
          <button className={`${styles.settingsTab} ${tab === "display" ? styles.settingsTabActive : ""}`} onClick={() => setTab("display")}>Display</button>
          <button className={`${styles.settingsTab} ${tab === "colors"  ? styles.settingsTabActive : ""}`} onClick={() => setTab("colors")}>Colors</button>
        </div>

        <div className={styles.settingsScrollBody}>
          {tab === "display" && (
            <>
              <SettingRow label="Show Steam ID"              checked={settings.showSteamId}       onChange={v => onChange("showSteamId", v)} />
              <SettingRow label="Show login name"            checked={settings.showLoginName}      onChange={v => onChange("showLoginName", v)} />
              <SettingRow label="Show playtime"              checked={settings.showPlaytime}       onChange={v => onChange("showPlaytime", v)} />
              <SettingRow label="Prime badges"               checked={settings.showPrimeBadge}     onChange={v => onChange("showPrimeBadge", v)} />
              <SettingRow label="Premier badges"             checked={settings.showPremierBadge}   onChange={v => onChange("showPremierBadge", v)} />
              <SettingRow label="Drop filter: eligible only" checked={settings.dropEligibleOnly}   onChange={v => onChange("dropEligibleOnly", v)} />
              <div className={styles.settingDivider} />
              <div className={styles.settingRowLabel} style={{ marginBottom: 6 }}>Card layout</div>
              <div className={styles.themeToggleRow}>
                <button className={`${styles.themeBtn} ${settings.cardLayout === "grid" ? styles.themeBtnActive : ""}`} onClick={() => onChange("cardLayout", "grid")}>Grid</button>
                <button className={`${styles.themeBtn} ${settings.cardLayout === "list" ? styles.themeBtnActive : ""}`} onClick={() => onChange("cardLayout", "list")}>List</button>
              </div>
              <div className={styles.settingDivider} />
              <div className={styles.settingRowLabel} style={{ marginBottom: 6 }}>Steam API key</div>
              <div className={styles.apiKeyRow}>
                <input
                  className={styles.apiKeyInput}
                  value={keyDraft}
                  onChange={e => onKeyDraftChange(e.target.value)}
                  placeholder="Paste key here…"
                  type="password"
                />
                <button
                  className={styles.resetThemeBtn}
                  onClick={onSaveKey}
                  disabled={keyDraft === apiKey}
                >Save</button>
              </div>
            </>
          )}

          {tab === "colors" && (
            <>
              <div className={styles.themeToggleRow}>
                <select
                  className={styles.themeSelect}
                  value={settings.themeMode}
                  onChange={e => onChange("themeMode", e.target.value)}
                >
                  {Object.entries(THEME_PRESETS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <button className={styles.resetThemeBtn} onClick={resetTheme}>Reset</button>
              </div>
              <div className={styles.colorGrid}>
                {COLOR_LABELS.map(([key, label]) => (
                  <div key={key} className={styles.colorRow}>
                    <span className={styles.colorLabel}>{label}</span>
                    <input
                      type="color"
                      value={settings.colors[settings.themeMode][key]}
                      onChange={e => updateColor(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

