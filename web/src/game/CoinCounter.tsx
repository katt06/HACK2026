import { useEffect, useRef } from "react";
import { animate, motion, useAnimationControls, useMotionValue, useReducedMotion, useTransform } from "framer-motion";

export function CoinIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#F5B82E" stroke="#C98F12" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="#C98F12" strokeWidth="1.5" opacity="0.6" />
      <path d="M8.5 9.5 a4 4 0 0 1 3 -2" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

// Coin balance pill: counts toward the new value and bounces when it changes.
// Reduced motion: the number updates instantly with a quick fade instead.
export function CoinCounter({ coins, size = "md" }: { coins: number; size?: "md" | "lg" }) {
  const reduce = useReducedMotion();
  const value = useMotionValue(coins);
  const shown = useTransform(value, (v) => Math.round(v).toLocaleString("en-US"));
  const controls = useAnimationControls();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      value.set(coins);
      return;
    }
    if (reduce) {
      value.set(coins);
      controls.start({ opacity: [0.4, 1], transition: { duration: 0.3 } });
      return;
    }
    const counting = animate(value, coins, { duration: 0.8, ease: "easeOut" });
    controls.start({ scale: [1, 1.25, 0.95, 1], rotate: [0, -6, 3, 0], transition: { duration: 0.5 } });
    return () => counting.stop();
  }, [coins, reduce, value, controls]);

  return (
    <motion.span
      animate={controls}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-coin-edge/40 bg-warn-soft font-black tabular-nums text-warn-ink ${
        size === "lg" ? "px-4 py-1.5 text-xl" : "px-2.5 py-1 text-sm"
      }`}
      aria-label={`${coins} coins`}
      role="status"
    >
      <CoinIcon className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
      <motion.span aria-hidden>{shown}</motion.span>
    </motion.span>
  );
}
