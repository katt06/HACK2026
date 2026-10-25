import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { BADGES, type BadgeId, type EquippedAvatar } from "@contract";
import { Avatar, describeAvatar } from "../avatar/Avatar";
import { BadgeArt } from "./Badges";

export type CelebrationItem = { kind: "level"; level: number } | { kind: "badge"; id: BadgeId };

const COLORS = ["#4E9B6E", "#8FD19E", "#F5B82E", "#F2998A", "#BFE3EE", "#C8834F"];

// ~80 frames ≈ 1.3s at 60fps, so confetti stays under the 1.5s animation budget.
function fireConfetti() {
  // canvas-confetti only checks reduced motion once at load, so check again each time.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const base = { disableForReducedMotion: true, ticks: 80, gravity: 1.4, decay: 0.9, startVelocity: 48, colors: COLORS, scalar: 1.1 };
  confetti({ ...base, particleCount: 60, angle: 60, spread: 70, origin: { x: 0, y: 0.75 } });
  confetti({ ...base, particleCount: 60, angle: 120, spread: 70, origin: { x: 1, y: 0.75 } });
  confetti({ ...base, particleCount: 50, spread: 100, origin: { x: 0.5, y: 0.45 } });
}

// Full-screen celebration. Tap, click, Enter, Space, or Escape dismisses it.
export function Celebration({ item, avatar, onDismiss }: { item: CelebrationItem; avatar?: EquippedAvatar; onDismiss: () => void }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    fireConfetti();
  }, []);

  const title = item.kind === "level" ? `Level ${item.level}!` : BADGES[item.id].name;
  const subtitle = item.kind === "level" ? "Nice and steady. Keep it rolling." : "Badge unlocked. Look at you go.";

  // Reduced motion: everything just fades.
  const pop = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3 } }
    : {
        initial: { scale: 0, rotate: -12, opacity: 0 },
        animate: { scale: 1, rotate: 0, opacity: 1 },
        transition: { type: "spring" as const, duration: 0.6, bounce: 0.5 },
      };
  const rise = (delay: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3, delay } }
      : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay, ease: "easeOut" as const } };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      aria-describedby="celebration-subtitle"
      tabIndex={-1}
      onClick={onDismiss}
      onKeyDown={(e) => {
        if (["Escape", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          onDismiss();
        }
      }}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-forest/85 px-6 text-center outline-none backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {item.kind === "level" ? (
        // Your own pixel capybara, outfit and all, on a sky tile.
        <motion.div {...pop} className="rounded-[2rem] border-4 border-coin bg-sky p-3 shadow-2xl">
          <Avatar avatar={avatar} size={160} className="h-40 w-40 lg:h-56 lg:w-56" label={avatar ? describeAvatar(avatar) : "Your capybara"} />
        </motion.div>
      ) : (
        <motion.div {...pop} className="rounded-full border-4 border-coin bg-cream p-3 shadow-2xl">
          <BadgeArt id={item.id} className="h-36 w-36 lg:h-48 lg:w-48" />
        </motion.div>
      )}
      <motion.p {...rise(0.15)} id="celebration-title" className="mt-6 text-6xl font-black tracking-tight text-white lg:text-8xl">
        {title}
      </motion.p>
      <motion.p {...rise(0.3)} id="celebration-subtitle" className="mt-2 text-xl font-extrabold text-mint lg:text-2xl">
        {subtitle}
      </motion.p>
      <motion.p {...rise(0.6)} className="mt-10 text-sm font-extrabold uppercase tracking-widest text-white/70">
        Tap anywhere to continue
      </motion.p>
    </motion.div>
  );
}
