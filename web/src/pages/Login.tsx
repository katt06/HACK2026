import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { useAuth } from "../auth/AuthContext";

const FRIENDLY: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match.",
  "auth/email-already-in-use": "An account with that email already exists. Try signing in.",
  "auth/weak-password": "Use at least 6 characters for your password.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/popup-closed-by-user": "",
};

function message(err: unknown): string {
  if (err instanceof FirebaseError) return FRIENDLY[err.code] ?? "Something went wrong. Please try again.";
  return "Something went wrong. Please try again.";
}

export default function Login() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
    return <Navigate to={from} replace />;
  }

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => (mode === "signin" ? signInWithEmail(email, password) : signUpWithEmail(email, password, name.trim())));
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold text-emerald-600">Savings Game</h1>
        <p className="mt-2 text-center text-slate-500">Save with friends. One small challenge at a time.</p>

        <button
          onClick={() => run(signInWithGoogle)}
          disabled={busy}
          className="mt-8 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          or
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <input className={input} placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          )}
          <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <input
            className={input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
            className="font-medium text-emerald-600"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
