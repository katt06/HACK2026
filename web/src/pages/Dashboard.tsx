import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ChallengeDoc, GetSafeToSaveResponse, GoalDoc, ScoreDoc, WithId } from "@contract";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { cardClass } from "../components/forms";
import { ProgressRing } from "../components/ProgressRing";
import { Skeleton } from "../components/Skeleton";
import { todayIso } from "../lib/dates";
import { formatCents, formatDate } from "../lib/format";
import { goalPlan, progressPct } from "../lib/goalMath";
import { useAsync } from "../lib/useAsync";

function Fallback({ children, onRetry, dark = false }: { children: ReactNode; onRetry: () => void; dark?: boolean }) {
  return (
    <div>
      <p className={dark ? "text-emerald-50" : "text-slate-600"}>{children}</p>
      <button onClick={onRetry} className={`mt-2 text-sm font-semibold ${dark ? "text-white underline" : "text-emerald-600"}`}>
        Try again
      </button>
    </div>
  );
}

function SectionTitle({ children, to }: { children: ReactNode; to?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-bold lg:text-xl">{children}</h2>
      {to && (
        <Link to={to} className="text-sm font-semibold text-emerald-600">
          See all
        </Link>
      )}
    </div>
  );
}

// ---------- Safe to save ----------

function Breakdown({ data }: { data: GetSafeToSaveResponse }) {
  const b = data.breakdown;
  const row = (label: ReactNode, amount: number, sign: "+" | "−", muted = false) => (
    <div className={`flex justify-between gap-4 ${muted ? "pl-4 text-sm text-emerald-100" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {sign} {formatCents(amount)}
      </span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {row("In checking now", b.currentBalance, "+")}
      {row(`Bills due before ${formatDate(data.nextPayday)}`, b.upcomingBillsTotal, "−")}
      {b.upcomingBills.map((bill) => (
        <div key={bill.merchant + bill.dueDate}>{row(`${bill.merchant} · ${formatDate(bill.dueDate)}`, bill.amount, "−", true)}</div>
      ))}
      {row("Everyday spending until payday", b.projectedSpending, "−")}
      {row("Safety cushion", b.safetyBuffer, "−")}
      <div className="flex justify-between gap-4 border-t border-emerald-400 pt-2 font-bold">
        <span>Safe to save</span>
        <span className="tabular-nums">{formatCents(data.amount)}</span>
      </div>
    </div>
  );
}

function SafeToSaveCard() {
  const state = useAsync(api.getSafeToSave);
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-3xl bg-emerald-600 p-6 text-white shadow-sm lg:p-10" aria-busy={state.status === "loading"}>
      <p className="text-sm font-medium text-emerald-100 lg:text-base">Safe to save today</p>

      {state.status === "loading" && (
        <div className="mt-2 space-y-3">
          <Skeleton className="h-14 w-48 bg-emerald-500 lg:h-20 lg:w-72" />
          <Skeleton className="h-4 w-36 bg-emerald-500" />
        </div>
      )}

      {state.status === "failed" && (
        <div className="mt-2">
          <p className="text-3xl font-bold lg:text-5xl">Hang tight</p>
          <Fallback onRetry={state.retry} dark>
            We couldn't work out your number just now. Your money is fine; we just need another try.
          </Fallback>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <p className="mt-1 text-6xl font-bold tracking-tight tabular-nums lg:text-8xl">{formatCents(state.data.amount)}</p>
          <p className="mt-2 text-emerald-100 lg:text-lg">
            {state.data.amount > 0 ? "You can move this to a goal without coming up short." : "Nothing extra this time, and that's okay."} Next payday{" "}
            {formatDate(state.data.nextPayday)}.
          </p>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="why-this-number"
            className="mt-4 flex items-center gap-1 rounded-full bg-emerald-700/60 px-4 py-2 text-sm font-semibold hover:bg-emerald-700"
          >
            Why this number?
            <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {open && (
            <div id="why-this-number" className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-10">
              <ul className="space-y-2 lg:text-lg">
                {state.data.explanation.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="text-emerald-200">
                      •
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl bg-emerald-700/40 p-4 lg:p-6">
                <Breakdown data={state.data} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------- Top goal ----------

// The unfinished goal with the nearest deadline, else the first goal.
function topGoal(goals: WithId<GoalDoc>[]): WithId<GoalDoc> | undefined {
  return goals.find((g) => g.currentAmount < g.targetAmount) ?? goals[0];
}

function TopGoalCard() {
  const state = useAsync(api.getMyGoals);
  return (
    <section className={cardClass}>
      <SectionTitle to="/goals">Top goal</SectionTitle>
      {state.status === "loading" && (
        <div className="flex items-center gap-5">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      )}
      {state.status === "failed" && <Fallback onRetry={state.retry}>Your goals are taking a moment to load.</Fallback>}
      {state.status === "ready" && <TopGoalBody goal={topGoal(state.data)} />}
    </section>
  );
}

function TopGoalBody({ goal }: { goal: WithId<GoalDoc> | undefined }) {
  if (!goal) {
    return (
      <div>
        <p className="text-slate-600">Pick something to save for and we'll work out the weekly pace.</p>
        <Link to="/goals" className="mt-3 inline-block rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">
          Create a goal
        </Link>
      </div>
    );
  }
  const pct = progressPct(goal);
  const plan = goalPlan(goal, todayIso());
  const pace =
    plan.status === "reached"
      ? "Goal reached!"
      : plan.status === "overdue"
        ? "Deadline passed. Open it to adjust your plan."
        : plan.paused
          ? `Paused until ${formatDate(plan.startsOn)}`
          : `${formatCents(plan.weeklyPace)}/week until ${formatDate(goal.deadline)}`;
  return (
    <Link to={`/goals/${goal.id}`} className="flex items-center gap-5">
      <ProgressRing pct={pct} size={96} stroke={10}>
        <span className="text-lg font-bold">{pct}%</span>
      </ProgressRing>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold lg:text-xl">{goal.name}</p>
        <p className="text-slate-600">
          {formatCents(goal.currentAmount)} of {formatCents(goal.targetAmount)}
        </p>
        <p className="text-sm text-slate-500">{pace}</p>
      </div>
    </Link>
  );
}

// ---------- Streak ----------

function StreakCard() {
  const state = useAsync(api.getMyScore);
  return (
    <section className={cardClass}>
      <SectionTitle>Streak</SectionTitle>
      {state.status === "loading" && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}
      {state.status === "failed" && <Fallback onRetry={state.retry}>Your streak will show up in a moment.</Fallback>}
      {state.status === "ready" && <StreakBody score={state.data} />}
    </section>
  );
}

function StreakBody({ score }: { score: ScoreDoc | null }) {
  if (!score || score.streak === 0) {
    return <p className="text-slate-600">No streak yet. Hit this week's savings target to start one.</p>;
  }
  return (
    <div>
      <p className="text-4xl font-bold lg:text-5xl">
        <span aria-hidden>🔥</span> {score.streak} {score.streak === 1 ? "week" : "weeks"}
      </p>
      <p className="mt-1 text-slate-500">
        Level {score.level} · {score.points} pts
      </p>
    </div>
  );
}

// ---------- Challenges ----------

const DIFFICULTY_STYLE: Record<ChallengeDoc["difficulty"], string> = {
  easy: "bg-sky-100 text-sky-800",
  medium: "bg-violet-100 text-violet-800",
  hard: "bg-rose-100 text-rose-800",
};

function ChallengesSection() {
  const state = useAsync(api.getChallenges);
  return (
    <section>
      <SectionTitle to="/challenges">Today's challenges</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-3">
        {state.status === "loading" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        {state.status === "failed" && (
          <div className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-3">
            <Fallback onRetry={state.retry}>New challenges are on their way.</Fallback>
          </div>
        )}
        {state.status === "ready" && state.data.challenges.length === 0 && (
          <p className="rounded-2xl bg-white p-5 text-slate-600 shadow-sm lg:col-span-3">You've cleared every challenge. Nice work! Check back tomorrow.</p>
        )}
        {state.status === "ready" &&
          state.data.challenges.slice(0, 3).map((c) => (
            <Link key={c.id} to="/challenges" className="flex flex-col rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${DIFFICULTY_STYLE[c.difficulty]}`}>{c.difficulty}</span>
                <span className="text-sm font-bold text-emerald-600">+{c.points} pts</span>
              </div>
              <p className="mt-3 font-medium lg:text-lg">{c.description}</p>
              <p className="mt-1 text-sm text-slate-500">{c.reason}</p>
            </Link>
          ))}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0];
  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-2xl font-bold lg:text-4xl">{firstName ? `Hi, ${firstName}` : "Hi there"}</h1>
      <SafeToSaveCard />
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2">
          <TopGoalCard />
        </div>
        <StreakCard />
      </div>
      <ChallengesSection />
    </div>
  );
}
