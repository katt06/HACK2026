import { Link } from "react-router-dom";

// Public page for presenting to judges. Doesn't require sign-in.
export default function Demo() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-4xl font-bold lg:text-6xl">Social Savings Game</h1>
      <p className="text-lg text-slate-500 lg:text-2xl">Demo mode coming soon.</p>
      <Link to="/login" className="w-fit rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white">
        Try it
      </Link>
    </main>
  );
}
