// Thick pill progress bar. `tone` picks the fill: leaf for goals, coin for points/levels.
export function ProgressBar({
  pct,
  tone = "leaf",
  size = "md",
  label,
}: {
  pct: number;
  tone?: "leaf" | "coin" | "sky";
  size?: "sm" | "md" | "lg";
  label?: string; // accessible name, e.g. "Spring break trip progress"
}) {
  const value = Math.min(100, Math.max(0, Math.round(pct)));
  const height = { sm: "h-3", md: "h-5", lg: "h-7" }[size];
  const fill = { leaf: "bg-leaf", coin: "bg-coin", sky: "bg-sky" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`${height} w-full overflow-hidden rounded-full border-2 border-line bg-surface-2`}
    >
      {value > 0 && (
        <div className={`relative h-full rounded-full ${fill} transition-[width] duration-700 ease-out`} style={{ width: `${Math.max(value, 6)}%` }}>
          {/* glossy highlight, like a game health bar */}
          <span aria-hidden className="absolute inset-x-2 top-[3px] h-[30%] rounded-full bg-white/35" />
        </div>
      )}
    </div>
  );
}
