import { useId } from "react";
import { BADGES, type BadgeId, type BadgeProgress } from "@contract";

// Flat capybara badge art (inline SVG, 120×120). Locked badges reuse the same shapes in two grays,
// so the silhouette hints at what's coming.

interface Palette {
  fur: string;
  furDark: string;
  ink: string;
  blush: string;
  glasses: string;
  water: string;
  waterDark: string;
  leaf: string;
  yuzu: string;
  yuzuDark: string;
  flame: string;
  flameCore: string;
  shine: string;
  ringA: string;
  ringB: string;
  duck: string;
  beak: string;
}

const BRAND: Palette = {
  fur: "#C8834F",
  furDark: "#8B5A3C",
  ink: "#3B2A1A",
  blush: "#F2998A",
  glasses: "#1E2A2A",
  water: "#BFE3EE",
  waterDark: "#7EC3D8",
  leaf: "#4E9B6E",
  yuzu: "#F5B82E",
  yuzuDark: "#D9931A",
  flame: "#F08A3C",
  flameCore: "#F5B82E",
  shine: "#FFFFFF",
  ringA: "#4E9B6E",
  ringB: "#FFFFFF",
  duck: "#F5C93D",
  beak: "#F08A3C",
};

const LOCKED: Palette = {
  fur: "var(--badge-locked)",
  furDark: "var(--badge-locked-2)",
  ink: "var(--badge-locked-2)",
  blush: "var(--badge-locked)",
  glasses: "var(--badge-locked-2)",
  water: "var(--badge-locked)",
  waterDark: "var(--badge-locked-2)",
  leaf: "var(--badge-locked-2)",
  yuzu: "var(--badge-locked)",
  yuzuDark: "var(--badge-locked-2)",
  flame: "var(--badge-locked-2)",
  flameCore: "var(--badge-locked)",
  shine: "transparent",
  ringA: "var(--badge-locked-2)",
  ringB: "var(--badge-locked)",
  duck: "var(--badge-locked)",
  beak: "var(--badge-locked-2)",
};

// Rounded capybara head facing right, like the mascot: big brown block, darker snout, small ears.
function CapyHead({ p, eyes }: { p: Palette; eyes: "open" | "happy" | "none" }) {
  return (
    <g>
      <circle cx="34" cy="40" r="9" fill={p.furDark} />
      <circle cx="52" cy="34" r="8" fill={p.furDark} />
      <rect x="18" y="36" width="80" height="64" rx="30" fill={p.fur} />
      <rect x="62" y="50" width="40" height="38" rx="18" fill={p.furDark} />
      <ellipse cx="90" cy="62" rx="3" ry="2.2" fill={p.ink} />
      <path d="M80 76 q4 4 8 0" stroke={p.ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="76" r="7" fill={p.blush} opacity="0.9" />
      {eyes === "open" && <circle cx="50" cy="60" r="3.5" fill={p.ink} />}
      {eyes === "happy" && <path d="M44 61 q6 -7 12 0" stroke={p.ink} strokeWidth="3" fill="none" strokeLinecap="round" />}
    </g>
  );
}

// Striped swim ring, drawn twice: once behind the capybara and once (clipped to the front half) over it.
function SwimRing({ p }: { p: Palette }) {
  return (
    <g>
      <ellipse cx="56" cy="86" rx="36" ry="12" fill="none" stroke={p.ringB} strokeWidth="12" />
      <ellipse cx="56" cy="86" rx="36" ry="12" fill="none" stroke={p.ringA} strokeWidth="12" strokeDasharray="15 15" />
    </g>
  );
}

// First Float: a capybara bobbing in a swim ring with a rubber duck, like the floating mascot.
function FirstFloatArt({ p }: { p: Palette }) {
  const front = useId();
  return (
    <g>
      <defs>
        <clipPath id={front}>
          <rect x="0" y="86" width="120" height="34" />
        </clipPath>
      </defs>
      {/* water */}
      <ellipse cx="60" cy="98" rx="54" ry="14" fill={p.water} />
      <path d="M10 104 q7 -4 14 0 t14 0" stroke={p.waterDark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M78 110 q7 -4 14 0 t14 0" stroke={p.waterDark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <SwimRing p={p} />
      {/* capybara: shoulders + head, scaled to sit inside the ring */}
      <g transform="translate(10 -2) scale(0.78)">
        <rect x="24" y="72" width="72" height="44" rx="22" fill={p.fur} />
        <CapyHead p={p} eyes="happy" />
        <rect x="34" y="30" width="22" height="12" rx="6" fill={p.glasses} />
        <rect x="60" y="28" width="22" height="12" rx="6" fill={p.glasses} />
        <rect x="52" y="32" width="10" height="3.5" rx="1.75" fill={p.glasses} />
      </g>
      <g clipPath={`url(#${front})`}>
        <SwimRing p={p} />
      </g>
      {/* rubber duck */}
      <g transform="translate(103 90)">
        <ellipse cx="0" cy="4" rx="9" ry="6" fill={p.duck} />
        <circle cx="3" cy="-5" r="5.5" fill={p.duck} />
        <path d="M8 -5 l6 1.5 l-6 2.5 z" fill={p.beak} />
        <circle cx="4.5" cy="-6.5" r="1.2" fill={p.ink} />
      </g>
    </g>
  );
}

function ChillStreakArt({ p }: { p: Palette }) {
  return (
    <g>
      <CapyHead p={p} eyes="none" />
      {/* sunglasses */}
      <rect x="34" y="50" width="26" height="16" rx="7" fill={p.glasses} />
      <rect x="64" y="50" width="26" height="16" rx="7" fill={p.glasses} />
      <rect x="56" y="54" width="12" height="4" rx="2" fill={p.glasses} />
      <path d="M39 55 l6 -2" stroke={p.shine} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <path d="M69 55 l6 -2" stroke={p.shine} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      {/* little flame */}
      <path d="M100 74 C108 84 112 92 107 101 C103 109 92 109 89 101 C86 93 94 88 100 74 Z" fill={p.flame} />
      <path d="M99 88 C103 93 104 98 101 102 C99 105 94 105 93 101 C92 97 96 95 99 88 Z" fill={p.flameCore} />
    </g>
  );
}

function YuzuMasterArt({ p }: { p: Palette }) {
  return (
    <g transform="translate(0 6)">
      <CapyHead p={p} eyes="happy" />
      {/* yuzu balanced on its head */}
      <circle cx="48" cy="24" r="15" fill={p.yuzu} />
      <circle cx="43" cy="20" r="1.4" fill={p.yuzuDark} />
      <circle cx="52" cy="27" r="1.4" fill={p.yuzuDark} />
      <circle cx="45" cy="30" r="1.2" fill={p.yuzuDark} />
      <circle cx="42" cy="18" r="4" fill={p.shine} opacity="0.5" />
      <path d="M48 9 v-4" stroke={p.furDark} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="56" cy="6" rx="8" ry="4" fill={p.leaf} transform="rotate(-20 56 6)" />
    </g>
  );
}

const ART: Record<BadgeId, (props: { p: Palette }) => React.ReactElement> = {
  "first-float": FirstFloatArt,
  "chill-streak": ChillStreakArt,
  "yuzu-master": YuzuMasterArt,
};

export function BadgeArt({ id, locked = false, className = "h-full w-full" }: { id: BadgeId; locked?: boolean; className?: string }) {
  const Art = ART[id];
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`${BADGES[id].name} badge${locked ? " (locked)" : ""}`}>
      <Art p={locked ? LOCKED : BRAND} />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <rect x="5" y="11" width="14" height="10" rx="3" fill="currentColor" stroke="none" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

export function BadgeTile({ badge }: { badge: BadgeProgress }) {
  const meta = BADGES[badge.id];
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`relative h-24 w-24 rounded-full border-2 p-2 lg:h-28 lg:w-28 ${
          badge.earned ? "border-coin bg-cream" : "border-dashed border-line bg-surface-2"
        }`}
      >
        <BadgeArt id={badge.id} locked={!badge.earned} />
        {!badge.earned && (
          <span className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-line bg-surface text-ink-faint">
            <LockIcon />
          </span>
        )}
      </div>
      <p className={`mt-2 font-extrabold ${badge.earned ? "text-heading" : "text-ink-muted"}`}>{meta.name}</p>
      {badge.earned ? (
        <p className="text-xs font-extrabold uppercase tracking-wide text-link">Earned</p>
      ) : (
        <>
          <p className="text-xs text-ink-muted">{meta.hint}</p>
          <p className="text-xs font-extrabold tabular-nums text-ink-faint">
            {badge.progress}/{badge.goal} {meta.unit}
          </p>
        </>
      )}
    </div>
  );
}

export function BadgeShelf({ badges }: { badges: BadgeProgress[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {badges.map((b) => (
        <BadgeTile key={b.id} badge={b} />
      ))}
    </div>
  );
}
