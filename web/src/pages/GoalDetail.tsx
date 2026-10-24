import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import type { GoalEntryDoc, WithId } from "@contract";
import { api, type GoalDetail as GoalDetailData } from "../api";
import { cardClass, inputClass, primaryButton } from "../components/forms";
import { ProgressRing } from "../components/ProgressRing";
import { todayIso } from "../lib/dates";
import { formatCents, formatDate, parseDollars } from "../lib/format";
import { flexOptions, goalPlan, progressPct, type FlexOption } from "../lib/goalMath";

type Panel = "none" | "contribute" | "expense";

function PaceCard({ data }: { data: GoalDetailData }) {
  const { goal } = data;
  const plan = goalPlan(goal, todayIso());
  let big: string, small: string;
  if (plan.status === "reached") [big, small] = ["Done!", "You hit your goal. Time to celebrate."];
  else if (plan.status === "overdue") [big, small] = [formatCents(plan.remaining), "to go. The deadline has passed. Log an expense to reset your plan."];
  else if (plan.paused) [big, small] = ["Paused", `until ${formatDate(plan.startsOn)}, then ${formatCents(plan.weeklyPace)}/week until ${formatDate(goal.deadline)}`];
  else [big, small] = [`${formatCents(plan.weeklyPace)}/week`, `to reach ${formatCents(goal.targetAmount)} by ${formatDate(goal.deadline)}`];
  return (
    <div>
      <p className="text-sm font-medium text-slate-500">Pace needed</p>
      <p className="text-3xl font-bold lg:text-4xl">{big}</p>
      <p className="mt-1 text-slate-600">{small}</p>
    </div>
  );
}

function ContributeForm({ goalId, onDone }: { goalId: string; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollars(amount);
    if (!cents) return setError("Enter an amount, like 25.");
    setBusy(true);
    try {
      await api.addContribution(goalId, cents, note);
      onDone(`Added ${formatCents(cents)}. It shows as unverified until a linked bank account confirms it.`);
    } catch {
      setError("Couldn't save that right now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input className={inputClass} inputMode="decimal" placeholder="Amount, like $25" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Contribution amount" autoFocus />
      <input className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} aria-label="Note" />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : "Add to goal"}
      </button>
    </form>
  );
}

function FlexCard({ option, title, lines, onChoose, busy }: { option: FlexOption; title: string; lines: string[]; onChoose: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col rounded-2xl border-2 border-slate-200 p-4 lg:p-6">
      <p className="font-bold lg:text-lg">{title}</p>
      <div className="mt-2 flex-1 space-y-1 text-sm text-slate-600 lg:text-base">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-500">New deadline</p>
      <p className="font-semibold">{formatDate(option.newDeadline)}</p>
      <p className="text-sm text-amber-700">
        +{option.weeksLater} {option.weeksLater === 1 ? "week" : "weeks"}
      </p>
      <button onClick={onChoose} disabled={busy} className={`${primaryButton} mt-4 py-2 text-sm`}>
        Choose this
      </button>
    </div>
  );
}

function ExpenseFlow({ data, onDone }: { data: GoalDetailData; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [expense, setExpense] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const options = expense ? flexOptions(data.goal, expense, todayIso()) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollars(amount);
    if (!cents) return setError("Enter what it cost, like 300.");
    if (!flexOptions(data.goal, cents, todayIso())) return setError("This goal doesn't have an active plan to adjust.");
    setError("");
    setExpense(cents);
  }

  async function choose(option: FlexOption) {
    setBusy(true);
    try {
      await api.applyGoalFlex(data.goal.id, expense!, option, note);
      onDone(option.choice === "pause" ? `Paused until ${formatDate(option.pausedUntil!)}. Your goal balance is unchanged.` : `New pace: ${formatCents(option.weeklyPace)}/week.`);
    } catch {
      setError("Couldn't update your plan right now. Please try again.");
      setBusy(false);
    }
  }

  if (!options) {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-slate-600">Unexpected costs happen. Tell us what came up and we'll adjust your plan. Your goal balance stays the same.</p>
        <input className={inputClass} inputMode="decimal" placeholder="What did it cost? Like $300" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Expense amount" autoFocus />
        <input className={inputClass} placeholder="What was it? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} aria-label="Expense note" />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className={primaryButton}>
          See my options
        </button>
      </form>
    );
  }

  const { pause, lowerPace } = options;
  return (
    <div>
      <p className="mb-3 text-slate-600">
        A {formatCents(expense!)} surprise. Here are two ways to keep going. Pick whichever feels easier.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <FlexCard
          option={pause}
          title="Pause saving"
          lines={[`Take ${pause.weeksLater} ${pause.weeksLater === 1 ? "week" : "weeks"} off`, `then ${formatCents(pause.weeklyPace)}/week`]}
          onChoose={() => choose(pause)}
          busy={busy}
        />
        <FlexCard
          option={lowerPace}
          title="Lower the pace"
          lines={[`Save ${formatCents(lowerPace.weeklyPace)}/week`, "starting now"]}
          onChoose={() => choose(lowerPace)}
          busy={busy}
        />
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <button onClick={() => setExpense(null)} className="mt-3 text-sm font-medium text-slate-500">
        Change the amount
      </button>
    </div>
  );
}

function EntryRow({ entry }: { entry: WithId<GoalEntryDoc> }) {
  const date = formatDate(entry.createdAt.slice(0, 10));
  if (entry.kind === "contribution") {
    return (
      <li className="flex items-center gap-3 py-3">
        <span className="font-semibold text-emerald-700">+{formatCents(entry.amount)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
          {date}
          {entry.note && ` · ${entry.note}`}
        </span>
        {entry.verified ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓ Verified</span>
        ) : (
          <span title="Logged by hand. It'll be verified once a bank account is linked." className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Unverified
          </span>
        )}
      </li>
    );
  }
  const how = entry.choice === "pause" ? `paused ${entry.weeksLater} wk` : `lower pace, +${entry.weeksLater} wk`;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="font-semibold text-slate-700">{formatCents(entry.amount)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
        {date} · {entry.note || "Unexpected expense"} · {how}
      </span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Flex</span>
    </li>
  );
}

export default function GoalDetail() {
  const { goalId = "" } = useParams();
  const [data, setData] = useState<GoalDetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound" | "failed">("loading");
  const [panel, setPanel] = useState<Panel>("none");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api
      .getGoal(goalId)
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch((err) => setStatus(err instanceof FirebaseError && err.code.endsWith("not-found") ? "notFound" : "failed"));
  }, [goalId]);

  useEffect(load, [load]);

  const done = (msg: string) => {
    setPanel("none");
    setNotice(msg);
    load();
  };

  const back = (
    <Link to="/goals" className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-900">
      ← All goals
    </Link>
  );

  if (status !== "ready" || !data) {
    const msg = { ready: "Loading…", loading: "Loading…", notFound: "We couldn't find that goal.", failed: "Couldn't load this goal. Please try again." }[status];
    return (
      <>
        {back}
        <p className={`${cardClass} text-slate-600`}>{msg}</p>
      </>
    );
  }

  const { goal, entries } = data;
  const pct = progressPct(goal);
  const tab = (p: Panel, label: string) => (
    <button
      onClick={() => setPanel(panel === p ? "none" : p)}
      className={`flex-1 rounded-xl px-4 py-3 font-semibold ${panel === p ? "bg-slate-900 text-white" : "bg-white text-slate-700 shadow-sm hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      {back}
      <h1 className="mb-6 text-2xl font-bold lg:text-4xl">{goal.name}</h1>

      {notice && (
        <p role="status" className="mb-4 rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white">
          {notice}
        </p>
      )}

      <section className={`${cardClass} flex flex-col items-center gap-6 sm:flex-row sm:items-center lg:gap-10`}>
        <ProgressRing pct={pct} size={180}>
          <span className="text-4xl font-bold">{pct}%</span>
          <span className="text-sm text-slate-500">
            {formatCents(goal.currentAmount)} of {formatCents(goal.targetAmount)}
          </span>
        </ProgressRing>
        <PaceCard data={data} />
      </section>

      <div className="mt-4 flex gap-3">
        {tab("contribute", "Add money")}
        {tab("expense", "Unexpected expense")}
      </div>

      {panel !== "none" && (
        <section className={`${cardClass} mt-4`}>
          {panel === "contribute" ? <ContributeForm goalId={goal.id} onDone={done} /> : <ExpenseFlow data={data} onDone={done} />}
        </section>
      )}

      <section className={`${cardClass} mt-4`}>
        <h2 className="text-lg font-bold">Activity</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-slate-500">Nothing yet. Add your first contribution above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
