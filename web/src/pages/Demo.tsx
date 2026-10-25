import { Link } from "react-router-dom";

// Public page for presenting to judges. Doesn't require sign-in.
export default function Demo() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-4xl font-extrabold lg:text-6xl">Social Savings Game</h1>
      <p className="text-lg text-ink-muted lg:text-2xl">Demo mode coming soon.</p>
      <Link to="/login" className="btn btn-primary btn-lg w-fit">
        Try it
      </Link>
    </main>
  );
}
