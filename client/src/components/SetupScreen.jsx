import { useState } from "react";
import styles from "./AuthScreens.module.css";

export default function SetupScreen({ onSetupComplete }) {
  const [step, setStep]               = useState("password"); // "password" | "recovery"
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [copied, setCopied]           = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const r    = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterPassword: password }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Setup failed."); return; }
      setRecoveryKey(data.recoveryKey);
      setStep("recovery");
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(recoveryKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Format recovery key as groups of 8 for readability
  function formatKey(key) {
    return key.match(/.{1,8}/g)?.join(" ") ?? key;
  }

  if (step === "recovery") {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <div className={styles.icon}>🔑</div>
          <h1 className={styles.title}>Save your recovery key</h1>
          <p className={styles.subtitle}>
            This is the only way to recover your vault if you forget your master
            password. Store it somewhere safe — it won't be shown again.
          </p>

          <div className={styles.recoveryKeyBox}>
            <code className={styles.recoveryKeyText}>{formatKey(recoveryKey)}</code>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <p className={styles.warning}>
            Once you continue, this key cannot be retrieved from the app.
          </p>

          <button
            className={styles.primaryBtn}
            onClick={onSetupComplete}
          >
            I have saved my recovery key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.icon}>🔒</div>
        <h1 className={styles.title}>Secure your vault</h1>
        <p className={styles.subtitle}>
          Set a master password to protect your Steam accounts and stored
          credentials.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Master password</label>
          <input
            type="password"
            className={styles.input}
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="new-password"
          />

          <label className={styles.label}>Confirm password</label>
          <input
            type="password"
            className={styles.input}
            placeholder="Repeat password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
          />

          {error && <p className={styles.error}>{error}</p>}

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={loading}
          >
            {loading ? "Setting up…" : "Create vault"}
          </button>
        </form>
      </div>
    </div>
  );
}
