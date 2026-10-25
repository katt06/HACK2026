import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { GetSafeToSaveResponse, GoalDoc, ScoreDoc, WithId } from "@contract";
import { api } from "../api";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { Avatar, describeAvatar } from "../avatar/Avatar";
import { useAuth } from "../auth/AuthContext";
import { Difficulty } from "../components/Difficulty";
import { cardClass } from "../components/forms";
import { ProgressRing } from "../components/ProgressRing";
import { Skeleton } from "../components/Skeleton";
import { TrackRecordChart } from "../components/TrackRecordChart";
import { todayIso } from "../lib/dates";
import { formatCents, formatDate } from "../lib/format";
import { goalPlan, progressPct } from "../lib/goalMath";
import { useAsync } from "../lib/useAsync";
import { BadgeShelf } from "../game/Badges";
import { useGame } from "../game/GameContext";
import { LevelBar } from "../game/LevelBar";

function Fallback({ children, onRetry, dark = false }: { children: ReactNode; onRetry: () => void; dark?: boolean }) {
  return (
    <div>
      <p className={dark ? "text-white/90" : "text-ink-muted"}>{children}</p>
      <button onClick={onRetry} className={`mt-2 text-sm font-semibold ${dark ? "text-white underline" : "text-link"}`}>
        Try again
      </button>
    </div>
  );
}

function SectionTitle({ children, to }: { children: ReactNode; to?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-extrabold lg:text-xl">{children}</h2>
      {to && (
        <Link to={to} className="text-sm font-semibold text-link">
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
    <div className={`flex justify-between gap-4 ${muted ? "pl-4 text-sm text-white/80" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {sign} {formatCents(amount)}
      </span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {row("In checking now", b.currentBalance, "+")}
      {b.expectedIncome > 0 && row(`Income expected by ${formatDate(data.nextPayday)}`, b.expectedIncome, "+")}
      {row(`Bills due before ${formatDate(data.nextPayday)}`, b.upcomingBillsTotal, "−")}
      {b.upcomingBills.map((bill) => (
        <div key={bill.merchant + bill.dueDate}>{row(`${bill.merchant} · ${formatDate(bill.dueDate)}`, bill.amount, "−", true)}</div>
      ))}
      {row("Everyday spending until payday", b.projectedSpending, "−")}
      {row("Safety cushion", b.safetyBuffer, "−")}
      <div className="flex justify-between gap-4 border-t border-white/30 pt-2 font-extrabold">
        <span>Left over</span>
        <span className="tabular-nums">{formatCents(data.amount)}</span>
      </div>
    </div>
  );
}

function SafeToSaveCard() {
  const state = useAsync(api.getSafeToSave);
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-3xl border-2 border-forest bg-forest p-6 text-white lg:p-10" aria-busy={state.status === "loading"}>
      <p className="text-sm font-medium text-white/80 lg:text-base">Left over this pay period</p>

      {state.status === "loading" && (
        <div className="mt-2 space-y-3">
          <Skeleton className="h-14 w-48 bg-leaf lg:h-20 lg:w-72" />
          <Skeleton className="h-4 w-36 bg-leaf" />
        </div>
      )}

      {state.status === "failed" && (
        <div className="mt-2">
          <p className="text-3xl font-extrabold lg:text-5xl">Hang tight</p>
          <Fallback onRetry={state.retry} dark>
            We couldn't work out your number just now. Your money is fine; we just need another try.
          </Fallback>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <p className="mt-1 text-6xl font-extrabold tracking-tight lg:text-8xl">{formatCents(state.data.amount)}</p>
          <p className="mt-2 text-white/80 lg:text-lg">
            {state.data.amount > 0
              ? "What's left after bills, everyday spending, and a small cushion. You can move it to a goal without coming up short."
              : "Nothing extra after bills and everyday spending this time, and that's okay."}{" "}
            Next payday {formatDate(state.data.nextPayday)}.
          </p>
          {state.data.history && state.data.history.length > 1 && (
            <div className="mt-5 rounded-2xl bg-surface p-4 text-ink lg:p-6">
              <p className="mb-2 text-sm font-semibold text-ink">Left over, last {state.data.history.length} days</p>
              <TrackRecordChart points={state.data.history} />
            </div>
          )}
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="why-this-number"
            className="mt-4 flex items-center gap-1 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold"
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
                    <span aria-hidden className="text-mint">
                      •
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl bg-white/10 p-4 lg:p-6">
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
      <div className="flex items-center gap-4">
        <img src="/brand/mascot-sitting.png" alt="" className="h-20 w-20 shrink-0 object-contain" />
        <div>
          <p className="text-ink-muted">Pick something to save for and we'll work out an easy weekly pace.</p>
          <Link to="/goals" className="btn btn-primary btn-sm mt-3">
            Create a goal
          </Link>
        </div>
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
        <span className="text-lg font-extrabold">{pct}%</span>
      </ProgressRing>
      <div className="min-w-0">
        <p className="truncate text-lg font-extrabold lg:text-xl">{goal.name}</p>
        <p className="text-ink-muted">
          {formatCents(goal.currentAmount)} of {formatCents(goal.targetAmount)}
        </p>
        <p className="text-sm text-ink-muted">{pace}</p>
      </div>
    </Link>
  );
}

// ---------- Streak ----------

function StreakCard() {
  const state = useAsync(api.getMyScore);
  return (
    <section className={cardClass}>
      <SectionTitle>Chill streak</SectionTitle>
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
    return <p className="text-ink-muted">No streak yet. Hit this week's savings target to start a chill streak.</p>;
  }
  return (
    <div>
      <p className="whitespace-nowrap text-4xl font-black text-heading lg:text-5xl">
        <span aria-hidden>🔥</span> {score.streak} {score.streak === 1 ? "week" : "weeks"}
      </p>
      <p className="mt-1 text-ink-muted">{score.streak >= 3 ? "Nice and steady." : "Keep it rolling."}</p>
      <StreakLevel />
    </div>
  );
}

// XP toward the next level, from the game layer (same numbers as the header).
function StreakLevel() {
  const { state } = useGame();
  if (!state) return null;
  return (
    <div className="mt-3">
      <LevelBar level={state.level} xpIntoLevel={state.xpIntoLevel} xpPerLevel={state.xpPerLevel} compact />
    </div>
  );
}

// ---------- Calendar ----------

function CalendarCard() {
  const state = useAsync(api.getActivity);
  return (
    <section className={`${cardClass} mx-auto w-full max-w-xl`}>
      <SectionTitle>Your month</SectionTitle>
      {state.status === "loading" && <Skeleton className="h-80 w-full" />}
      {state.status === "failed" && <Fallback onRetry={state.retry}>Your calendar will show up in a moment.</Fallback>}
      {state.status === "ready" && <ActivityCalendar activity={state.data} />}
    </section>
  );
}

// ---------- Badges ----------

function BadgesCard() {
  const { state } = useGame();
  return (
    <section className={cardClass}>
      <SectionTitle>Badges</SectionTitle>
      {state ? (
        <BadgeShelf badges={state.badges} />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Challenges ----------

function ChallengesSection() {
  const state = useAsync(api.getChallenges);
  return (
    <section>
      <SectionTitle to="/challenges">Today's challenges</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-3">
        {state.status === "loading" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="card space-y-3 p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        {state.status === "failed" && (
          <div className="card p-5 lg:col-span-3">
            <Fallback onRetry={state.retry}>New challenges are on their way.</Fallback>
          </div>
        )}
        {state.status === "ready" && state.data.challenges.length === 0 && (
          <p className="card p-5 text-ink-muted lg:col-span-3">You've cleared every challenge. Time to chill. Check back tomorrow.</p>
        )}
        {state.status === "ready" &&
          state.data.challenges.slice(0, 3).map((c) => (
            <Link key={c.id} to="/challenges" className="card flex flex-col p-5 transition-colors hover:border-leaf">
              <div className="flex items-center justify-between">
                <Difficulty level={c.difficulty} />
                <span className="text-sm font-extrabold text-link">+{c.points} XP</span>
              </div>
              <p className="mt-3 font-medium lg:text-lg">{c.description}</p>
              <p className="mt-1 text-sm text-ink-muted">{c.reason}</p>
            </Link>
          ))}
      </div>
    </section>
  );
}

// My capybara next to the greeting, with a way into the shop.
function Greeting({ firstName }: { firstName?: string }) {
  const { state } = useGame();
  return (
    <div className="flex items-center gap-4">
      <Link to="/shop" className="rounded-2xl bg-sky-soft p-1 transition-transform hover:-rotate-3" aria-label="Your capybara. Open the shop">
        {state ? <Avatar avatar={state.avatar} size={64} label={describeAvatar(state.avatar)} /> : <Skeleton className="h-16 w-16" />}
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold lg:text-4xl">{firstName ? `Hi, ${firstName}` : "Hi there"}</h1>
        <Link to="/shop" className="text-sm font-extrabold text-link">
          Dress up your capy →
        </Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0];
  return (
    <div className="space-y-4 lg:space-y-6">
      <Greeting firstName={firstName} />
      <SafeToSaveCard />
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2">
          <TopGoalCard />
        </div>
        <StreakCard />
      </div>
      <CalendarCard />
      <BadgesCard />
      <ChallengesSection />
    </div>
  );
}
