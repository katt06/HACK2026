import { useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { normalizeInviteCode, type JoinGroupResponse } from "@contract";
import { api } from "../api";

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
        className="field text-center font-mono text-2xl tracking-[0.3em] uppercase"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? "Joining…" : "Join group"}
      </button>
    </form>
  );
}
