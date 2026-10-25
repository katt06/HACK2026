// The logo art has dark forest lettering, so full logos always sit on a cream panel (readable in dark mode).

export function LogoBadge({ className = "h-9 w-9" }: { className?: string }) {
  return <img src="/brand/logo-badge.png" alt="" className={`object-contain ${className}`} />;
}

// Compact header lockup: badge + name in Nunito, colored by the heading token so it works in dark mode.
export function LogoLockup({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoBadge className={size === "lg" ? "h-12 w-12" : "h-9 w-9"} />
      <span className={`font-black tracking-tight text-heading ${size === "lg" ? "text-2xl" : "text-xl"}`}>
        Capy<span className="text-leaf">Balance</span>
      </span>
    </span>
  );
}

export function LogoFull({ className = "h-40" }: { className?: string }) {
  return (
    <div className="rounded-3xl bg-cream p-4">
      <img src="/brand/logo.png" alt="CapyBalance" className={`mx-auto object-contain ${className}`} />
    </div>
  );
}
