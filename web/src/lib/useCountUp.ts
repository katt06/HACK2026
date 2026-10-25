import { useEffect, useRef, useState } from "react";

// Animates a number toward `target` (ease-out). Jumps straight there with reduced motion.
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / durationMs);
      const next = Math.round(start + (target - start) * (1 - (1 - t) ** 3));
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
