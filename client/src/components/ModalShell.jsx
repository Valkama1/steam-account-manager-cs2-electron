import { useState, useCallback } from "react";
import styles from "../App.module.css";

/**
 * Wraps the overlay + modal box for every centered dialog.
 * Plays the open animation on mount and the close animation before unmounting.
 *
 * Usage:
 *   <ModalShell onClose={onClose} className={styles.settingsModal}>
 *     {(close) => (
 *       <>
 *         <button onClick={close}>X</button>
 *         ...content...
 *       </>
 *     )}
 *   </ModalShell>
 */
export default function ModalShell({ onClose, className = "", children }) {
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 150);
  }, [closing, onClose]);

  return (
    <div
      className={`${styles.overlay} ${closing ? styles.overlayOut : ""}`}
      onMouseDown={handleClose}
    >
      <div
        className={`${styles.modal} ${className} ${closing ? styles.modalOut : ""}`}
        onMouseDown={e => e.stopPropagation()}
      >
        {children(handleClose)}
      </div>
    </div>
  );
}
