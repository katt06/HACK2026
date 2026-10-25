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

// Both logos have a white sticker outline, so they read on light and dark backgrounds.
// The wide wordmark: phone header and login.
export function LogoWordmark({ className = "h-9" }: { className?: string }) {
  return <img src="/brand/logo-wordmark.png" alt="CapyBalance" className={`object-contain ${className}`} />;
}

// The stacked logo (capybara over the wordmark): desktop side rail.
export function LogoFull({ className = "h-16" }: { className?: string }) {
  return <img src="/brand/canvalogo.png" alt="CapyBalance" className={`object-contain ${className}`} />;
}
