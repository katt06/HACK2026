import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import type { HealthResponse } from "@contract";
import { functions } from "./firebase";

function Home() {
  const [status, setStatus] = useState("checking functions…");

  useEffect(() => {
    httpsCallable<void, HealthResponse>(functions, "health")()
      .then((res) => setStatus(`functions ok · ${res.data.time}`))
      .catch(() => setStatus("functions unreachable"));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold">Social Savings Game</h1>
      <p className="text-slate-500">Placeholder page. Coming soon.</p>
      <p className="rounded bg-slate-100 px-3 py-1 font-mono text-xs text-slate-600">{status}</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <p>Page not found.</p>
      <Link to="/" className="text-blue-600 underline">Home</Link>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
