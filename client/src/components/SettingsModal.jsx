import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "../App.module.css";
import { THEME_PRESETS, COLOR_LABELS, AUTO_REFRESH_OPTIONS, CATPPUCCIN_MOCHA } from "../constants.js";

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
      >ⓘ</span>
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

export default function SettingsModal({ settings, onChange, onClose, keyDraft, onKeyDraftChange, onSaveKey, apiKey }) {
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
        </div>
      </div>
    </div>
  );
}
