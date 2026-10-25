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

  const input = "field";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Hero: brand art always sits on light cream/sky, so it reads the same in dark mode. */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-cream px-6 pt-8 pb-6 lg:min-h-dvh lg:py-12">
        <img src="/brand/logo-wordmark.png" alt="CapyBalance" className="relative h-20 object-contain lg:h-28" />
        <img src="/brand/mascot-coin.png" alt="" className="relative mt-2 h-40 object-contain lg:mt-6 lg:h-80" />
        <p className="relative mt-3 max-w-xs text-center text-lg font-extrabold text-forest lg:max-w-sm lg:text-2xl">
          Save with friends. Nice and steady.
        </p>
      </section>

      <section className="flex items-start justify-center px-4 py-8 lg:items-center lg:py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-3xl font-black tracking-tight">{mode === "signin" ? "Welcome back" : "Join the herd"}</h1>
          <p className="mt-1 text-center text-ink-muted">One small challenge at a time.</p>

          <button onClick={() => run(signInWithGoogle)} disabled={busy} className="btn btn-secondary mt-6 w-full">
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-extrabold uppercase tracking-wide text-ink-faint">
            <div className="h-0.5 flex-1 rounded bg-line" />
            or
            <div className="h-0.5 flex-1 rounded bg-line" />
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
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-muted">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
              className="font-extrabold text-link underline-offset-2 hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
