import { useState, useEffect } from "react";
import ModalShell from "./ModalShell.jsx";
import styles from "../App.module.css";
import authStyles from "./AuthScreens.module.css";

export default function TotpSetupModal({ onClose }) {
  const [step, setStep]       = useState("loading"); // "loading" | "scan" | "verify" | "done"
  const [secret, setSecret]   = useState("");
  const [uri, setUri]         = useState("");
  const [code, setCode]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/totp/setup", { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setSecret(d.secret); setUri(d.uri); setStep("scan"); }
        else setStep("error");
      })
      .catch(() => setStep("error"));
  }, []);

  async function handleConfirm(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Confirmation failed."); return; }
      setStep("done");
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose} className={styles.settingsModal}>
      {(close) => (
        <>
          <div className={styles.modalHeader}>
            <span className={styles.modalTitle}>Enable Two-Factor Authentication</span>
            <button className={styles.iconBtn} onClick={close}>✕</button>
          </div>

          <div className={styles.modalBody} style={{ padding: "24px", maxWidth: 420 }}>
            {step === "loading" && (
              <p style={{ color: "var(--dim)", textAlign: "center" }}>Loading…</p>
            )}

            {step === "error" && (
              <p style={{ color: "var(--red)" }}>
                Failed to generate TOTP secret. Make sure the vault is unlocked.
              </p>
            )}

            {step === "scan" && (
              <>
                <p style={{ marginBottom: 16, color: "var(--dim)", fontSize: 13 }}>
                  Scan the QR code with your authenticator app (Google Authenticator,
                  Authy, Bitwarden, etc.), or enter the secret manually.
                </p>

                {/* QR code via a data URI rendered with a Google Charts-style
                    API — but we keep it local using an img pointing to a
                    free public QR generation endpoint. Since the secret is
                    LOCAL only, generating the QR client-side is fine. */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`}
                    alt="TOTP QR code"
                    width={180}
                    height={180}
                    style={{ borderRadius: 8, border: "2px solid var(--border)" }}
                  />
                </div>

                <p style={{ marginBottom: 6, fontSize: 12, color: "var(--dim)" }}>
                  Manual entry secret:
                </p>
                <code style={{
                  display: "block",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  letterSpacing: "0.15em",
                  wordBreak: "break-all",
                  marginBottom: 20,
                  color: "var(--accent)",
                }}>
                  {secret}
                </code>

                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ width: "100%" }}
                  onClick={() => setStep("verify")}
                >
                  I've scanned the code
                </button>
              </>
            )}

            {step === "verify" && (
              <>
                <p style={{ marginBottom: 16, color: "var(--dim)", fontSize: 13 }}>
                  Enter the 6-digit code from your authenticator app to confirm.
                </p>

                <form onSubmit={handleConfirm}>
                  <input
                    type="text"
                    placeholder="000000"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    style={{
                      width: "100%",
                      textAlign: "center",
                      letterSpacing: "0.3em",
                      fontSize: 22,
                      fontFamily: "var(--mono)",
                      padding: "10px",
                      marginBottom: 12,
                    }}
                  />

                  {error && (
                    <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
                      {error}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btn}
                      style={{ flex: 1 }}
                      onClick={() => setStep("scan")}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      style={{ flex: 2 }}
                      disabled={loading || code.length < 6}
                    >
                      {loading ? "Verifying…" : "Enable 2FA"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {step === "done" && (
              <>
                <p style={{ color: "var(--green)", fontSize: 15, marginBottom: 16, textAlign: "center" }}>
                  Two-factor authentication is now enabled.
                </p>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ width: "100%" }}
                  onClick={close}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
}
