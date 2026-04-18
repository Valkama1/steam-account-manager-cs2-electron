import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "../App.module.css";
import { THEME_PRESETS, COLOR_LABELS, AUTO_REFRESH_OPTIONS } from "../constants.js";
import { InfoIcon, CloseIcon, DownloadIcon, UploadIcon, DeleteIcon } from "./icons.jsx";
import ModalShell from "./ModalShell.jsx";
import TotpSetupModal from "./TotpSetupModal.jsx";

export function InfoTip({ text }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  function handleMouseEnter() {
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 8 });
  }

  return (
    <>
      <span
        ref={ref}
        className={styles.infoTip}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
        onClick={e => e.stopPropagation()}
      ><InfoIcon size={12} /></span>
      {pos && createPortal(
        <div className={styles.infoTipTooltip} style={{ top: pos.top, left: pos.left }}>
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

export function SettingRow({ label, checked, onChange, hint }) {
  return (
    <div
      className={styles.settingRow}
      onClick={() => onChange(!checked)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === " " && onChange(!checked)}
    >
      <span className={styles.settingRowLabel}>
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
      <div className={`${styles.settingSwitch} ${checked ? styles.settingSwitchOn : ""}`}>
        <div className={styles.settingSwitchThumb} />
      </div>
    </div>
  );
}

export default function SettingsModal({ settings, onChange, onClose, keyDraft, onKeyDraftChange, onSaveKey, apiKey, leetifyDraft, onLeetifyDraftChange, onSaveLeetifyKey, leetifyKey, onClearCache, onLockVault, onSetupVault }) {
  const [tab, setTab] = useState("display");
  const [confirmClear, setConfirmClear] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [exportPhrase, setExportPhrase]   = useState("");
  const [exportFlow, setExportFlow]       = useState(null); // null | "prompt" | "loading" | "error"
  const [pendingImport, setPendingImport] = useState(null); // parsed v2 file awaiting passphrase
  const [importPhrase, setImportPhrase]   = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [totpOpen, setTotpOpen]     = useState(false);
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisableErr, setTotpDisableErr]   = useState("");

  useEffect(() => {
    if (tab !== "security") return;
    fetch("/api/auth/status").then(r => r.json()).then(setAuthStatus).catch(() => {});
  }, [tab]);

  async function handleDisableTotp() {
    setTotpDisableErr("");
    const r = await fetch("/api/auth/totp/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpDisableCode }),
    });
    const d = await r.json();
    if (!r.ok) { setTotpDisableErr(d.error || "Failed"); return; }
    setTotpDisableCode("");
    setAuthStatus(prev => ({ ...prev, totpEnabled: false }));
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleExportSecure(e) {
    e.preventDefault();
    setExportFlow("loading");
    try {
      const r = await fetch("/api/accounts/export-secure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: exportPhrase }),
      });
      if (!r.ok) {
        const d = await r.json();
        setImportStatus(`Export error: ${d.error}`);
        setExportFlow(null);
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `steam-manager-secure-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportFlow(null);
      setExportPhrase("");
    } catch {
      setImportStatus("Export failed — cannot reach server.");
      setExportFlow(null);
    }
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportStatus(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // v2 secure export — hold it and ask for passphrase before sending
      if (data && data.version === 2) {
        setPendingImport(data);
        setImportPhrase("");
        return;
      }
      await doImport(data, null);
    } catch {
      setImportStatus("Invalid file.");
    }
  }

  async function doImport(data, passphrase) {
    try {
      const body = passphrase ? { ...data, passphrase } : data;
      const r = await fetch("/api/accounts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) { setImportStatus(`Error: ${result.error}`); return; }
      setImportStatus(`Imported ${result.added} account(s) — ${result.total} total`);
      setPendingImport(null);
      setImportPhrase("");
    } catch {
      setImportStatus("Import failed — cannot reach server.");
    }
  }

  function updateColor(key, value) {
    onChange("colors", {
      ...settings.colors,
      [settings.themeMode]: { ...settings.colors[settings.themeMode], [key]: value },
    });
  }

  function resetTheme() {
    const defaults = THEME_PRESETS[settings.themeMode]?.defaults ?? THEME_PRESETS.dark?.defaults;
    onChange("colors", { ...settings.colors, [settings.themeMode]: { ...defaults } });
  }

  return (
    <>
    <ModalShell onClose={onClose} className={styles.settingsModal}>
      {(close) => (<>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Settings</span>
          <button className={styles.modalClose} onClick={close}><CloseIcon size={14} /></button>
        </div>

        <div className={styles.settingsTabs}>
          <button className={`${styles.settingsTab} ${tab === "display"   ? styles.settingsTabActive : ""}`} onClick={() => setTab("display")}>Display</button>
          <button className={`${styles.settingsTab} ${tab === "colors"    ? styles.settingsTabActive : ""}`} onClick={() => setTab("colors")}>Colors</button>
          <button className={`${styles.settingsTab} ${tab === "security"  ? styles.settingsTabActive : ""}`} onClick={() => setTab("security")}>Security</button>
        </div>

        <div className={styles.settingsScrollBody}>
          {tab === "display" && (
            <>
              <SettingRow label="Show Steam ID"              checked={settings.showSteamId}       onChange={v => onChange("showSteamId", v)}       hint="Shows the account's Steam64 ID on each card." />
              <SettingRow label="Show login name"            checked={settings.showLoginName}      onChange={v => onChange("showLoginName", v)}      hint="Shows the Steam login name used to sign in to the account." />
              <SettingRow label="Show playtime"              checked={settings.showPlaytime}       onChange={v => onChange("showPlaytime", v)}       hint="Shows total CS2 hours played on each card." />
              <SettingRow label="Prime badges"               checked={settings.showPrimeBadge}     onChange={v => onChange("showPrimeBadge", v)}     hint="Shows a badge on accounts that have CS2 Prime status." />
              <SettingRow label="Premier badges"             checked={settings.showPremierBadge}   onChange={v => onChange("showPremierBadge", v)}   hint="Shows a badge on accounts that are eligible to play Premier mode." />
              <SettingRow label="Drop filter: eligible only" checked={settings.dropEligibleOnly}   onChange={v => onChange("dropEligibleOnly", v)}   hint="When the Drop filter chip is active, only show accounts with Prime — Prime is required to receive the weekly care package drop." />
              <div className={styles.settingDivider} />
              <div className={styles.settingRow}>
                <span className={styles.settingRowLabel}>
                  Auto-refresh interval
                  <InfoTip text="Automatically refreshes all Steam data (bans, playtime, avatar) in the background. Accounts without a Steam profile URL are skipped." />
                </span>
                <select
                  className={styles.sortSelect}
                  value={settings.autoRefreshInterval}
                  onChange={e => onChange("autoRefreshInterval", Number(e.target.value))}
                >
                  {AUTO_REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className={styles.settingDivider} />
              <div className={styles.settingRowLabel} style={{ marginBottom: 6 }}>
                Card layout
                <InfoTip text="Switch between a grid of cards or a compact single-column list." />
              </div>
              <div className={styles.themeToggleRow}>
                <button className={`${styles.themeBtn} ${settings.cardLayout === "grid" ? styles.themeBtnActive : ""}`} onClick={() => onChange("cardLayout", "grid")}>Grid</button>
                <button className={`${styles.themeBtn} ${settings.cardLayout === "list" ? styles.themeBtnActive : ""}`} onClick={() => onChange("cardLayout", "list")}>List</button>
              </div>
              <div className={styles.settingDivider} />
              <div className={styles.settingRowLabel} style={{ marginBottom: 6 }}>
                Steam API key
                <InfoTip text="Required to fetch ban status and CS2 playtime. Get yours at steamcommunity.com/dev/apikey — it's free." />
              </div>
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
              <div className={styles.settingDivider} />
              <div className={styles.settingRowLabel} style={{ marginBottom: 6 }}>
                Leetify API key
                <InfoTip text="Optional. Enables Leetify stats on account cards. Get your key from your Leetify account settings." />
              </div>
              <div className={styles.apiKeyRow}>
                <input
                  className={styles.apiKeyInput}
                  value={leetifyDraft}
                  onChange={e => onLeetifyDraftChange(e.target.value)}
                  placeholder="Paste key here…"
                  type="password"
                />
                <button
                  className={styles.resetThemeBtn}
                  onClick={onSaveLeetifyKey}
                  disabled={leetifyDraft === leetifyKey}
                >Save</button>
              </div>
              <div className={styles.settingDivider} />
              <div className={styles.settingRow} style={{ cursor: "default" }}>
                <span className={styles.settingRowLabel}>
                  Clear API cache
                  <InfoTip text="Wipes all Steam-fetched data (avatar, name, ban status, playtime) from every account. Use Refresh All afterwards to repopulate. Useful for testing or troubleshooting." />
                </span>
                {confirmClear ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className={styles.resetThemeBtn} style={{ color: "var(--red)" }} onClick={() => { onClearCache(); setConfirmClear(false); }}><DeleteIcon size={13} /> Confirm</button>
                    <button className={styles.resetThemeBtn} onClick={() => setConfirmClear(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className={styles.resetThemeBtn} onClick={() => setConfirmClear(true)}>Clear cache</button>
                )}
              </div>
              <div className={styles.settingDivider} />

              {/* ── Secure export ── */}
              <div className={styles.settingRow} style={{ cursor: "default" }}>
                <span className={styles.settingRowLabel}>
                  Secure export
                  <InfoTip text="Exports all accounts including encrypted passwords, protected by a passphrase you choose. Use this when migrating to another machine." />
                </span>
                <button
                  className={styles.resetThemeBtn}
                  onClick={() => setExportFlow(exportFlow === "prompt" ? null : "prompt")}
                >
                  <DownloadIcon size={13} /> Export
                </button>
              </div>
              {exportFlow === "prompt" && (
                <form onSubmit={handleExportSecure} style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                  <input
                    className={styles.apiKeyInput}
                    type="password"
                    placeholder="Export passphrase…"
                    value={exportPhrase}
                    onChange={e => setExportPhrase(e.target.value)}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <button
                    type="submit"
                    className={styles.resetThemeBtn}
                    disabled={exportFlow === "loading" || !exportPhrase}
                  >
                    {exportFlow === "loading" ? "…" : "Go"}
                  </button>
                </form>
              )}

              {/* ── Import ── */}
              <div className={styles.settingRow} style={{ cursor: "default", marginTop: 4 }}>
                <span className={styles.settingRowLabel}>
                  Import
                  <InfoTip text="Import from a previously exported file. Secure exports (v2) will ask for the passphrase used at export time. Duplicates are always skipped." />
                </span>
                <label className={styles.resetThemeBtn} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <UploadIcon size={13} /> Import
                  <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
                </label>
              </div>
              {pendingImport && (
                <form
                  onSubmit={e => { e.preventDefault(); doImport(pendingImport, importPhrase); }}
                  style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}
                >
                  <input
                    className={styles.apiKeyInput}
                    type="password"
                    placeholder="Passphrase used at export…"
                    value={importPhrase}
                    onChange={e => setImportPhrase(e.target.value)}
                    autoFocus
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    className={styles.resetThemeBtn}
                    disabled={!importPhrase}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className={styles.resetThemeBtn}
                    onClick={() => { setPendingImport(null); setImportPhrase(""); }}
                  >
                    Cancel
                  </button>
                </form>
              )}

              {importStatus && <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>{importStatus}</p>}
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
                {settings.themeMode !== "auto" && (
                  <button className={styles.resetThemeBtn} onClick={resetTheme}>Reset</button>
                )}
              </div>
              {settings.themeMode === "auto" ? (
                <p className={styles.autoThemeNote}>
                  Using <strong>{window.matchMedia("(prefers-color-scheme: dark)").matches ? "Catppuccin Mocha" : "Catppuccin Latte"}</strong> based on your OS setting. Switch to a specific theme to customize colors.
                </p>
              ) : (
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
              )}
            </>
          )}

          {tab === "security" && (
            <>
              {!authStatus ? (
                <p style={{ color: "var(--dim)", fontSize: 13, padding: "8px 0" }}>Loading…</p>
              ) : authStatus.legacyMode ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12, lineHeight: 1.6 }}>
                    Your vault is currently in <strong style={{ color: "var(--text)" }}>legacy mode</strong> —
                    account credentials are stored with an auto-generated key but no master password.
                    Set a master password to protect your vault.
                  </p>
                  <div className={styles.settingRow} style={{ cursor: "default" }}>
                    <span className={styles.settingRowLabel}>Vault protection</span>
                    <button className={styles.resetThemeBtn} onClick={() => { close(); onSetupVault?.(); }}>
                      Set master password
                    </button>
                  </div>
                </>
              ) : authStatus.hasAuth ? (
                <>
                  <div className={styles.settingRow} style={{ cursor: "default" }}>
                    <span className={styles.settingRowLabel}>Vault status</span>
                    <span style={{
                      fontSize: 12,
                      color: authStatus.locked ? "var(--yellow)" : "var(--green)",
                      fontWeight: 600,
                    }}>
                      {authStatus.locked ? "Locked" : "Unlocked"}
                    </span>
                  </div>

                  {!authStatus.locked && (
                    <div className={styles.settingRow} style={{ cursor: "default" }}>
                      <span className={styles.settingRowLabel}>Lock vault now</span>
                      <button className={styles.resetThemeBtn} onClick={() => {
                        close();
                        onLockVault?.();
                      }}>
                        Lock
                      </button>
                    </div>
                  )}

                  <div className={styles.settingDivider} />

                  <div className={styles.settingRow} style={{ cursor: "default" }}>
                    <span className={styles.settingRowLabel}>
                      Two-factor authentication
                      <InfoTip text="Requires a 6-digit code from an authenticator app (Google Authenticator, Authy, etc.) every time you unlock the vault." />
                    </span>
                    {authStatus.totpEnabled ? (
                      <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>Enabled</span>
                    ) : (
                      <button
                        className={styles.resetThemeBtn}
                        disabled={authStatus.locked}
                        onClick={() => setTotpOpen(true)}
                      >
                        Enable
                      </button>
                    )}
                  </div>

                  {authStatus.totpEnabled && !authStatus.locked && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        className={styles.apiKeyInput}
                        placeholder="Enter current 2FA code to disable"
                        value={totpDisableCode}
                        onChange={e => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        style={{ maxWidth: 220 }}
                      />
                      <button
                        className={styles.resetThemeBtn}
                        style={{ color: "var(--red)" }}
                        disabled={totpDisableCode.length < 6}
                        onClick={handleDisableTotp}
                      >
                        Disable 2FA
                      </button>
                    </div>
                  )}
                  {totpDisableErr && (
                    <p style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{totpDisableErr}</p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--dim)" }}>
                  No vault configured. Restart the app to go through setup.
                </p>
              )}
            </>
          )}
        </div>
      </>)}
    </ModalShell>

    {totpOpen && (
      <TotpSetupModal
        onClose={() => {
          setTotpOpen(false);
          fetch("/api/auth/status").then(r => r.json()).then(setAuthStatus).catch(() => {});
        }}
      />
    )}
    </>
  );
}
