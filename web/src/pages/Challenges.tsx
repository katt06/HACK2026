import { useEffect, useState } from "react";
import type { ChallengeDoc, WithId } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";

export default function Challenges() {
  const [challenges, setChallenges] = useState<WithId<ChallengeDoc>[]>([]);

  useEffect(() => {
    api.getChallenges().then((res) => setChallenges(res.challenges)).catch(console.error);
  }, []);

  return (
    <>
      <PageHeader title="Challenges" subtitle="Small wins that add up." />
      <ul className="grid gap-3 lg:grid-cols-2">
        {challenges.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>{c.difficulty}</span>
              <span className="text-emerald-600">+{c.points} pts</span>
            </div>
            <p className="mt-2 font-medium lg:text-lg">{c.description}</p>
            <p className="mt-1 text-sm text-slate-500">{c.reason}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
