import { useState } from "react";

type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const choose = (t: Theme) => {
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
    setTheme(t);
  };
  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex rounded-2xl border-2 border-line bg-surface p-1">
      {(["system", "light", "dark"] as const).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className={`rounded-xl px-3 py-1.5 text-sm font-extrabold capitalize ${theme === t ? "bg-primary text-on-primary" : "text-ink-muted hover:text-ink"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
