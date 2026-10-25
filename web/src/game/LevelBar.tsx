import { motion, useReducedMotion } from "framer-motion";

// XP toward the next level. Remounts per level (key) so a level-up refills from empty.
export function LevelBar({ level, xpIntoLevel, xpPerLevel, compact = false }: { level: number; xpIntoLevel: number; xpPerLevel: number; compact?: boolean }) {
  const reduce = useReducedMotion();
  const pct = Math.min(100, Math.round((xpIntoLevel / xpPerLevel) * 100));
  return (
    <div className="w-full">
      <div className={`mb-1 flex items-baseline justify-between font-extrabold ${compact ? "text-xs" : "text-sm"}`}>
        <span className="text-heading">Level {level}</span>
        <span className="tabular-nums text-ink-muted">
          {xpIntoLevel}/{xpPerLevel} XP
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`XP toward level ${level + 1}`}
        aria-valuenow={xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={xpPerLevel}
        className={`${compact ? "h-3" : "h-5"} w-full overflow-hidden rounded-full border-2 border-line bg-surface-2`}
      >
        <motion.div
          key={level}
          className="relative h-full rounded-full bg-leaf"
          initial={reduce ? { width: `${pct}%`, opacity: 0 } : { width: "0%" }}
          animate={{ width: `${pct}%`, opacity: 1 }}
          transition={reduce ? { duration: 0.3 } : { duration: 0.8, ease: "easeOut" }}
        >
          <span aria-hidden className="absolute inset-x-2 top-[3px] h-[30%] rounded-full bg-white/35" />
        </motion.div>
      </div>
    </div>
  );
}
