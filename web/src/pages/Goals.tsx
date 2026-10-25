import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GOAL_NAME_MAX, type GoalDoc, type WithId } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { cardClass, inputClass, primaryButton } from "../components/forms";
import { EmptyState } from "../components/EmptyState";
import { ProgressRing } from "../components/ProgressRing";
import { addDays, todayIso } from "../lib/dates";
import { formatCents, formatDate, parseDollars } from "../lib/format";
import { goalPlan, progressPct } from "../lib/goalMath";

function paceLine(goal: GoalDoc): string {
  const plan = goalPlan(goal, todayIso());
  if (plan.status === "reached") return "Goal reached!";
  if (plan.status === "overdue") return `Deadline passed · ${formatCents(plan.remaining)} to go`;
  return plan.paused ? `Paused until ${formatDate(plan.startsOn)}` : `${formatCents(plan.weeklyPace)}/week until ${formatDate(goal.deadline)}`;
}

function CreateGoalForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState(addDays(todayIso(), 90));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tomorrow = addDays(todayIso(), 1);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const targetAmount = parseDollars(target);
    if (!name.trim()) return setError("Give your goal a name.");
    if (!targetAmount) return setError("Enter how much you want to save, like 1,200.");
    if (!deadline || deadline < tomorrow) return setError("Pick a deadline after today.");
    setError("");
    setBusy(true);
    try {
      const goal = await api.createGoal({ name, targetAmount, deadline });
      navigate(`/goals/${goal.id}`);
    } catch {
      setError("Couldn't create the goal right now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input className={inputClass} placeholder="What are you saving for?" value={name} onChange={(e) => setName(e.target.value)} maxLength={GOAL_NAME_MAX} aria-label="Goal name" />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-ink-muted">
          Target
          <input className={`${inputClass} mt-1`} inputMode="decimal" placeholder="$1,200" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="block text-sm text-ink-muted">
          Deadline
          <input className={`${inputClass} mt-1`} type="date" min={tomorrow} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Creating…" : "Create goal"}
      </button>
    </form>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState<WithId<GoalDoc>[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.getMyGoals().then(setGoals).catch(() => setFailed(true));
  }, []);

  return (
    <>
      <PageHeader title="Goals" subtitle="Name it, size it, hit it." />
      <div className="space-y-4">
        {failed && <p className={`${cardClass} text-ink-muted`}>Couldn't load your goals. Pull to refresh or try again soon.</p>}
        {!goals && !failed && <div className={`${cardClass} animate-pulse text-ink-faint`}>Loading your goals…</div>}
        {goals?.length === 0 && (
          <EmptyState mascot="coin" title="No goals yet">
            Pick something you'd love to have in a few months. We'll find a pace that feels easy.
          </EmptyState>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {goals?.map((g) => (
            <Link key={g.id} to={`/goals/${g.id}`} className={`${cardClass} flex items-center gap-5 transition-shadow hover:shadow-md`}>
              <ProgressRing pct={progressPct(g)} size={72} stroke={8}>
                <span className="text-sm font-extrabold">{progressPct(g)}%</span>
              </ProgressRing>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold">{g.name}</p>
                <p className="text-ink-muted">
                  {formatCents(g.currentAmount)} of {formatCents(g.targetAmount)}
                </p>
                <p className="text-sm text-ink-muted">{paceLine(g)}</p>
              </div>
            </Link>
          ))}
        </div>
        <section className={cardClass}>
          <h2 className="mb-3 text-lg font-extrabold">New goal</h2>
          <CreateGoalForm />
        </section>
      </div>
    </>
  );
}
