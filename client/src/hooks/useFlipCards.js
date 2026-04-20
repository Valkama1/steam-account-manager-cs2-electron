import { useRef, useLayoutEffect } from "react";

/**
 * FLIP animation for account cards.
 *
 * Usage:
 *   const snapshot = useFlipCards([activeFilters, search, sortField, sortDir]);
 *   // call snapshot() synchronously BEFORE any state change that reorders cards
 */
export function useFlipCards(deps) {
  const firstPos = useRef(new Map());
  const pending  = useRef(false);

  function snapshot() {
    const map = new Map();
    document.querySelectorAll("[data-account-id]").forEach(el => {
      map.set(el.dataset.accountId, el.getBoundingClientRect());
    });
    firstPos.current = map;
    pending.current  = true;
  }

  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;

    const first = firstPos.current;

    document.querySelectorAll("[data-account-id]").forEach(el => {
      const id   = el.dataset.accountId;
      const prev = first.get(id);
      const last = el.getBoundingClientRect();

      if (!prev) {
        // Card just appeared — fade + scale in
        el.animate(
          [
            { opacity: "0", transform: "scale(0.93)" },
            { opacity: "1", transform: "scale(1)"    },
          ],
          { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "backwards" }
        );
        return;
      }

      const dx = prev.left - last.left;
      const dy = prev.top  - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0px, 0px)"          },
        ],
        { duration: 320, easing: "cubic-bezier(0.2, 0, 0, 1)" }
      );
    });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return snapshot;
}
