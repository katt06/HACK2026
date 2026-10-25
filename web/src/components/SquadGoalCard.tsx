import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { SQUAD_MILESTONES, SQUAD_MILESTONE_POINTS, type SquadGoalSummary } from "@contract";
import { api } from "../api";
import { useGame } from "../game/GameContext";
import { addDays, todayIso } from "../lib/dates";
import { formatCents, formatDate, parseDollars } from "../lib/format";
import { Button } from "./Button";
import { inputClass } from "./forms";
import { Pill } from "./Pill";
import { ProgressBar } from "./ProgressBar";

// The server's messages for these are written for people ("You have $40.00 in checking."), so show them as-is.
function friendly(err: unknown, fallback: string): string {
  const shown = ["failed-precondition", "invalid-argument", "already-exists"];
  return err instanceof FirebaseError && shown.some((c) => err.code.endsWith(c)) ? err.message : fallback;
}

function StartSquadGoal({ groupId, onStarted }: { groupId: string; onStarted: (s: SquadGoalSummary) => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState(addDays(todayIso(), 90));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollars(target);
    if (!name.trim()) return setError("Name your squad goal, like Cabin trip.");
    if (!cents) return setError("Enter a target, like 2000.");
    setBusy(true);
    setError("");
    try {
      onStarted(await api.createSquadGoal({ groupId, name: name.trim(), targetAmount: cents, deadline }));
    } catch (err) {
      setError(friendly(err, "Couldn't start the squad goal right now. Please try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-ink-muted">Save for one thing together, like a trip. Everyone earns +{SQUAD_MILESTONE_POINTS} XP at each 25% milestone.</p>
      <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Cabin trip, Concert tickets, …" aria-label="Squad goal name" />
      <div className="grid grid-cols-2 gap-3">
        <input className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target, like $2,000" aria-label="Squad goal target" />
        <input className={inputClass} type="date" value={deadline} min={addDays(todayIso(), 1)} onChange={(e) => setDeadline(e.target.value)} aria-label="Squad goal deadline" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="secondary" block loading={busy}>
        Start a squad goal
      </Button>
    </form>
  );
}

function ChipIn({ squad, onChipped }: { squad: SquadGoalSummary; onChipped: (s: SquadGoalSummary, unlocked: number[], amount: number) => void }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function chipIn(cents: number | null) {
    if (!cents) return setError("Enter an amount, like 25.");
    setBusy(true);
    setError("");
    try {
      const res = await api.contributeToSquadGoal(squad.groupId, cents);
      setAmount("");
      onChipped(res.squadGoal, res.newMilestones, cents);
    } catch (err) {
      setError(friendly(err, "Couldn't add that right now. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void chipIn(parseDollars(amount));
      }}
    >
      <div className="flex flex-wrap gap-2">
        {[1000, 2500, 5000].map((c) => (
          <button key={c} type="button" disabled={busy} onClick={() => chipIn(c)} className="btn btn-secondary btn-sm">
            {formatCents(c)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={`${inputClass} flex-1`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Or another amount" aria-label="Chip-in amount" />
        <Button type="submit" variant="primary" loading={busy}>
          Chip in
        </Button>
      </div>
      <p className="text-xs text-ink-muted">Comes out of your checking balance. Your squad sees that you chipped in, never how much.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

// One shared goal per group: progress %, milestones, and who has chipped in. Dollars only for your own share.
export function SquadGoalCard({ groupId }: { groupId: string }) {
  const { refresh } = useGame();
  const [squad, setSquad] = useState<SquadGoalSummary | null | undefined>(undefined); // undefined = loading
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    setFailed(false);
    api.getSquadGoal(groupId).then(setSquad, (err) => {
      console.error(err);
      setFailed(true);
    });
  }, [groupId]);

  useEffect(load, [load]);

  if (failed) {
    return (
      <p className="text-sm text-ink-muted">
        Couldn't load the squad goal.{" "}
        <button onClick={load} className="font-semibold text-link">
          Try again
        </button>
      </p>
    );
  }
  if (squad === undefined) return <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />;

  return (
    <div className="rounded-2xl border-2 border-line p-4 lg:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-link">Squad goal</p>
      {notice && (
        <p role="status" className="mt-2 rounded-xl border-2 border-mint bg-primary-soft px-3 py-2 font-extrabold text-heading">
          {notice}
        </p>
      )}

      {squad === null ? (
        <div className="mt-2">
          <StartSquadGoal
            groupId={groupId}
            onStarted={(s) => {
              setSquad(s);
              setNotice(`${s.name} is on! Chip in whenever you can.`);
            }}
          />
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h3 className="text-xl font-extrabold">{squad.name}</h3>
            <span className="shrink-0 text-sm text-ink-muted">by {formatDate(squad.deadline)}</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <ProgressBar pct={squad.progressPct} tone="sky" size="lg" label={`${squad.name} progress`} />
            </div>
            <span className="w-12 text-right text-lg font-extrabold">{squad.progressPct}%</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SQUAD_MILESTONES.map((m) => (
              <Pill key={m} tone={squad.milestonesReached.includes(m) ? "leaf" : "neutral"}>
                {squad.milestonesReached.includes(m) ? "✓" : ""} {m}%
              </Pill>
            ))}
            <span className="text-xs text-ink-muted">+{SQUAD_MILESTONE_POINTS} XP for everyone at each one</span>
          </div>

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Who has chipped in">
            {squad.members.map((m) => (
              <li key={m.userId}>
                <Pill tone={m.contributedThisWeek ? "leaf" : m.contributions > 0 ? "sky" : "neutral"}>
                  {m.isMe ? "You" : m.displayName}
                  {m.contributedThisWeek ? " ✓ this week" : m.contributions > 0 ? ` · ${m.contributions}×` : ""}
                </Pill>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-sm">
            {squad.myContributed > 0 ? (
              <>
                You've chipped in <strong>{formatCents(squad.myContributed)}</strong>.
              </>
            ) : (
              "You haven't chipped in yet."
            )}
          </p>

          {squad.isComplete ? (
            <p className="mt-3 font-extrabold text-heading">The squad did it! Goal reached. 🎉</p>
          ) : (
            <div className="mt-3">
              <ChipIn
                squad={squad}
                onChipped={(next, unlocked, amount) => {
                  setSquad(next);
                  setNotice(
                    unlocked.length
                      ? `The squad hit ${unlocked.at(-1)}%! Everyone gets +${unlocked.length * SQUAD_MILESTONE_POINTS} XP.`
                      : `You chipped in ${formatCents(amount)}. Nice and steady.`,
                  );
                  if (unlocked.length) void refresh(); // milestone XP can level you up
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
