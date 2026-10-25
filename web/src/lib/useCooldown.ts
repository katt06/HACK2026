import { useCallback, useEffect, useState } from "react";

// A cooldown that survives reloads (stored per key), so a button can't be spammed by refreshing the page.
export function useCooldown(key: string, ms: number): { secondsLeft: number; start: () => void } {
  const storageKey = `cooldown.${key}`;
  const readUntil = () => {
    try {
      return Number(localStorage.getItem(storageKey)) || 0;
    } catch {
      return 0;
    }
  };
  const [until, setUntil] = useState(readUntil);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [until]);

  const start = useCallback(() => {
    const next = Date.now() + ms;
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // Storage blocked: the cooldown still applies until reload.
    }
    setUntil(next);
    setNow(Date.now());
  }, [ms, storageKey]);

  return { secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)), start };
}
