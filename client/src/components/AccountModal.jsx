import { useState } from "react";
import styles from "../App.module.css";
import { PrimeIcon, PremierIcon, PremierRatingBadge, CloseIcon, CheckIcon, DeleteIcon, RefreshIcon, PlusIcon } from "./icons.jsx";
import { parseDuration, remainingStr, isExpired } from "../cooldown.js";

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

export default function AccountModal({ mode, acc, onClose, onAdd, onEdit, onDelete }) {
  const isEdit = mode === "edit";

  const [name, setName]             = useState(isEdit ? acc.name         : "");
  const [alias, setAlias]           = useState(isEdit ? acc.alias        : "");
  const [prime, setPrime]           = useState(isEdit ? !!acc.prime      : false);
  const [premierReady, setPremierReady] = useState(isEdit ? !!acc.premierReady : false);
  const [premierRating, setPremierRating] = useState(isEdit && acc.premierRating != null ? String(acc.premierRating) : "");
  const [notes, setNotes]           = useState(isEdit ? (acc.notes || "") : "");
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
      notes: notes.trim(),
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
          <button className={styles.modalClose} onClick={onClose}><CloseIcon size={14} /></button>
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

          <label className={styles.label}>Notes <span>(optional)</span></label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
                 placeholder="e.g. main, smurfing, gifted…" autoComplete="off" />

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
              {busy ? <><RefreshIcon size={14} /> Saving…</> : isEdit ? <><CheckIcon size={14} /> Save</> : <><PlusIcon size={14} /> Add Account</>}
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
                <button className={styles.dangerConfirm} onClick={() => onDelete(acc.id)}><DeleteIcon size={13} /> Delete</button>
                <button className={styles.dangerCancel} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button className={styles.dangerTrigger} onClick={() => setConfirmDelete(true)}>
                <DeleteIcon size={13} /> Delete account
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
