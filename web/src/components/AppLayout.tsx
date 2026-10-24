import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
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

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors lg:flex-row lg:gap-3 lg:px-4 lg:py-3 lg:text-base ${
    isActive ? "text-emerald-600 lg:bg-emerald-50" : "text-slate-500 hover:text-slate-900"
  }`;

export function AppLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Side rail on large screens */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white lg:p-6">
        <p className="mb-8 text-xl font-bold text-emerald-600">Savings Game</p>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-sm text-slate-500">
          <p className="truncate">{user?.displayName ?? user?.email}</p>
          <button onClick={signOut} className="font-medium text-slate-700 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <p className="text-lg font-bold text-emerald-600">Savings Game</p>
          <button onClick={signOut} className="text-sm font-medium text-slate-500">
            Sign out
          </button>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 lg:px-10 lg:pt-10 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav on phones and tablets */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold lg:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-500 lg:text-lg">{subtitle}</p>}
    </div>
  );
}
