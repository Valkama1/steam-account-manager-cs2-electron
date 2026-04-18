import { useState } from "react";
import styles from "./AuthScreens.module.css";

export default function UnlockScreen({ totpEnabled, onUnlocked }) {
  const [mode, setMode]         = useState("unlock"); // "unlock" | "recover"
  const [password, setPassword] = useState("");
  const [totp, setTotp]         = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm]   = useState("");
  const [needTotp, setNeedTotp] = useState(totpEnabled);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleUnlock(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterPassword: password, totpCode: totp || undefined }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.totpRequired) { setNeedTotp(true); setError(""); }
        else setError(data.error || "Unlock failed.");
        return;
      }
      onUnlocked();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPassword !== newConfirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryKey, newMasterPassword: newPassword }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Recovery failed."); return; }
      onUnlocked();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "recover") {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <div className={styles.icon}>🔑</div>
          <h1 className={styles.title}>Recover vault</h1>
          <p className={styles.subtitle}>
            Enter your recovery key and choose a new master password.
            2FA will be cleared after recovery.
          </p>

          <form onSubmit={handleRecover} className={styles.form}>
            <label className={styles.label}>Recovery key</label>
            <input
              type="text"
              className={`${styles.input} ${styles.mono}`}
              placeholder="Your 64-character recovery key"
              value={recoveryKey}
              onChange={e => setRecoveryKey(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />

            <label className={styles.label}>New master password</label>
            <input
              type="password"
              className={styles.input}
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />

            <label className={styles.label}>Confirm new password</label>
            <input
              type="password"
              className={styles.input}
              placeholder="Repeat password"
              value={newConfirm}
              onChange={e => setNewConfirm(e.target.value)}
              autoComplete="new-password"
            />

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.primaryBtn} disabled={loading}>
              {loading ? "Recovering…" : "Recover vault"}
            </button>

            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setMode("unlock"); setError(""); }}
            >
              Back to unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.icon}>🔐</div>
        <h1 className={styles.title}>Vault locked</h1>
        <p className={styles.subtitle}>
          Enter your master password to unlock Steam Manager.
        </p>

        <form onSubmit={handleUnlock} className={styles.form}>
          <label className={styles.label}>Master password</label>
          <input
            type="password"
            className={styles.input}
            placeholder="Master password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />

          {needTotp && (
            <>
              <label className={styles.label}>Authenticator code</label>
              <input
                type="text"
                className={`${styles.input} ${styles.mono}`}
                placeholder="6-digit code"
                value={totp}
                onChange={e => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? "Unlocking…" : "Unlock"}
          </button>

          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => { setMode("recover"); setError(""); }}
          >
            Forgot password? Use recovery key
          </button>
        </form>
      </div>
    </div>
  );
}
