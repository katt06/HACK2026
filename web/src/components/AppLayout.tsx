import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LogoFull, LogoWordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { CoinCounter } from "../game/CoinCounter";
import { GameProvider, useGame } from "../game/GameContext";
import { LevelBar } from "../game/LevelBar";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/dashboard", label: "Home", icon: icon("M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10") },
  { to: "/goals", label: "Goals", icon: icon("M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z") },
  { to: "/challenges", label: "Challenges", icon: icon("M13 2L4 14h7l-1 8 9-12h-7l1-8z") },
  { to: "/leaderboard", label: "Ranks", icon: icon("M8 21V11M16 21V7M12 21V3M4 21h16") },
  { to: "/group", label: "Group", icon: icon("M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 10a4 4 0 100-8 4 4 0 000 8zm11 10v-2a4 4 0 00-3-3.87M16 2.13a4 4 0 010 7.75") },
];

// Bottom tabs: big icon in a pill that fills mint when active, short label underneath.
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `group flex flex-col items-center gap-0.5 text-[11px] font-extrabold transition-colors ${isActive ? "text-heading" : "text-ink-faint hover:text-ink-muted"}`;
const tabIconClass = (isActive: boolean) =>
  `flex h-10 w-14 items-center justify-center rounded-2xl transition-colors ${isActive ? "bg-primary-soft text-link" : ""}`;

const railClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-base font-extrabold transition-colors ${
    isActive ? "border-mint bg-primary-soft text-heading" : "border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink"
  }`;

export function AppLayout() {
  return (
    <GameProvider>
      <AppShell />
    </GameProvider>
  );
}

function AppShell() {
  const { user, signOut } = useAuth();
  const { state: game } = useGame();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Side rail on large screens */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-r-2 lg:border-line lg:bg-surface lg:p-5">
        <LogoFull className="mx-auto h-36" />
        <nav className="mt-6 flex flex-col gap-1.5">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={railClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {game && (
            <div className="card space-y-3 p-3">
              <CoinCounter coins={game.coins} />
              <LevelBar level={game.level} xpIntoLevel={game.xpIntoLevel} xpPerLevel={game.xpPerLevel} compact />
            </div>
          )}
          <ThemeToggle />
          <p className="truncate text-sm text-ink-muted">{user?.displayName ?? user?.email}</p>
          <button onClick={signOut} className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center justify-between border-b-2 border-line bg-surface px-4 py-2.5 lg:hidden">
          <LogoWordmark />
          <div className="flex items-center gap-1">
            {game && <CoinCounter coins={game.coins} />}
            <button onClick={signOut} className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-32 lg:px-10 lg:pt-10 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar on phones and tablets */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t-2 border-line bg-surface/95 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={tabClass}>
            {({ isActive }) => (
              <>
                <span className={tabIconClass(isActive)}>{item.icon}</span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-black tracking-tight lg:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-ink-muted lg:text-lg">{subtitle}</p>}
    </div>
  );
}
