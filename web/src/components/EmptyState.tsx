import type { ReactNode } from "react";

// coin = sitting in the grass with coins (planning), sitting = holding a coin, drink = sipping, float = swim ring + duck.
export type Mascot = "coin" | "sitting" | "drink" | "float";

// Friendly empty state with the capybara. Keep copy short and calm ("Nice and steady.").
export function EmptyState({ mascot = "drink", title, children, action }: { mascot?: Mascot; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center lg:py-10">
      <img src={`/brand/mascot-${mascot}.png`} alt="" className="h-32 w-32 object-contain lg:h-40 lg:w-40" />
      <p className="mt-3 text-xl font-extrabold text-heading lg:text-2xl">{title}</p>
      {children && <div className="mt-1 max-w-md text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
