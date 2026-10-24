import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2">
      <p>Page not found.</p>
      <Link to="/" className="text-emerald-600 underline">
        Home
      </Link>
    </main>
  );
}
