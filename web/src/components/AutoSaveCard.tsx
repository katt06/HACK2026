import { useState } from "react";
import { FirebaseError } from "firebase/app";
import type { AutoSaveRule, GoalDoc, WithId } from "@contract";
import { api } from "../api";
import { formatCents, formatDate, parseDollars } from "../lib/format";
import { Button } from "./Button";
import { cardClass, inputClass } from "./forms";
import { Pill } from "./Pill";

const PERCENTS = [5, 10, 20];

const describe = (rule: AutoSaveRule) => (rule.kind === "fixed" ? formatCents(rule.amount) : `${rule.percent}% of your balance`);
const same = (a: AutoSaveRule | null, b: AutoSaveRule | null) => JSON.stringify(a) === JSON.stringify(b);

// Payday auto-save. The server caps every run at that day's left-over money, so it can't leave you short.
export function AutoSaveCard({ goal, onSaved }: { goal: WithId<GoalDoc>; onSaved: (msg: string) => void }) {
  const [rule, setRule] = useState<AutoSaveRule | null>(goal.autoSave ?? null);
  const [fixed, setFixed] = useState(goal.autoSave?.kind === "fixed" ? (goal.autoSave.amount / 100).toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(next: AutoSaveRule | null) {
    if (same(next, rule)) return;
    setBusy(true);
    setError("");
    try {
      await api.setAutoSave(goal.id, next);
      setRule(next);
      onSaved(next ? `Auto-save is on: ${describe(next)} every payday, never more than what's left over.` : "Auto-save is off.");
    } catch (err) {
      setError(err instanceof FirebaseError && err.code.endsWith("invalid-argument") ? err.message : "Couldn't update auto-save right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (label: string, next: AutoSaveRule | null) => (
    <button
      key={label}
      type="button"
      disabled={busy}
      onClick={() => save(next)}
      aria-pressed={same(next, rule)}
      className={`btn btn-sm ${same(next, rule) ? "btn-primary" : "btn-secondary"}`}
    >
      {label}
    </button>
  );

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Auto-save on payday</h2>
        <Pill tone={rule ? "leaf" : "neutral"}>{rule ? "On" : "Off"}</Pill>
      </div>
      <p className="mt-1 text-ink-muted">
        {rule
          ? `Every payday we'll move ${describe(rule)} here, but never more than what's left over that day, so bills are always covered.`
          : "Pick an amount and we'll move it here every payday, but never more than what's left over that day."}
      </p>
      {goal.autoSaveLastRunOn && <p className="mt-1 text-sm text-ink-muted">Last ran {formatDate(goal.autoSaveLastRunOn)}.</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {chip("Off", null)}
        {PERCENTS.map((p) => chip(`${p}% of balance`, { kind: "percentOfBalance", percent: p }))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const cents = parseDollars(fixed);
          if (!cents || cents < 100) return setError("Enter a fixed amount of at least $1, like 25.");
          void save({ kind: "fixed", amount: cents });
        }}
      >
        <input
          className={`${inputClass} flex-1`}
          inputMode="decimal"
          placeholder="Or a fixed amount, like $25"
          value={fixed}
          onChange={(e) => setFixed(e.target.value)}
          aria-label="Fixed auto-save amount"
        />
        <Button type="submit" variant="secondary" loading={busy}>
          Use this
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
