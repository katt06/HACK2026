import type { ReactNode } from "react";

export function ProgressRing({ pct, size = 160, stroke = 14, children }: { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${pct}% saved`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="stroke-leaf transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
