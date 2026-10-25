import type { ReactNode } from "react";

export type PillTone = "leaf" | "coin" | "sky" | "blush" | "neutral";

const TONES: Record<PillTone, string> = {
  leaf: "bg-primary-soft text-heading",
  coin: "bg-warn-soft text-warn-ink",
  sky: "bg-sky-soft text-heading",
  blush: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-ink-muted",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${TONES[tone]} ${className}`}>{children}</span>;
}
