import { useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import type { JoinGroupResponse } from "@contract";
import { api } from "../api";
import { normalizeInviteCode } from "../lib/inviteCode";

function friendlyError(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : "";
  if (code.endsWith("not-found")) return "No group uses that code. Double-check it with whoever invited you.";
  if (code.endsWith("failed-precondition")) return "That group is full.";
  if (code.endsWith("invalid-argument")) return "Invite codes are 6 letters and numbers.";
  return "Couldn't join right now. Please try again.";
}

export function JoinGroupForm({ initialCode = "", onJoined }: { initialCode?: string; onJoined: (res: JoinGroupResponse) => void }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!normalizeInviteCode(code)) {
      setError("Invite codes are 6 letters and numbers.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      onJoined(await api.joinGroup(code));
      setCode("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC234"
        maxLength={8}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label="Invite code"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] uppercase outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        {busy ? "Joining…" : "Join group"}
      </button>
    </form>
  );
}
