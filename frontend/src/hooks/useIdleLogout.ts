import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
  'visibilitychange',
] as const;

const LAST_ACTIVITY_KEY = 'qurb_last_activity';

/**
 * Logs the user out after `timeoutMs` of inactivity.
 * - Tracks UI activity via global events.
 * - Syncs across tabs via localStorage — activity in one tab keeps all tabs alive.
 * - `warnMs` before timeout, fires `onWarn` (optional) so UI can show a warning.
 */
export function useIdleLogout({
  enabled,
  timeoutMs,
  warnMs,
  onLogout,
  onWarn,
}: {
  enabled: boolean;
  timeoutMs: number;
  warnMs?: number;
  onLogout: () => void;
  onWarn?: (msSinceActivity: number) => void;
}) {
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const mark = () => {
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      warnedRef.current = false;
    };

    // Initialize if unset
    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) mark();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const tick = setInterval(() => {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
      const idle = Date.now() - last;
      if (idle >= timeoutMs) {
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        onLogout();
      } else if (warnMs && !warnedRef.current && idle >= timeoutMs - warnMs) {
        warnedRef.current = true;
        onWarn?.(idle);
      }
    }, 10_000);

    return () => {
      clearInterval(tick);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [enabled, timeoutMs, warnMs, onLogout, onWarn]);
}

export function clearIdleMarker() {
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}
