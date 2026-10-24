import { useEffect, useState } from "react";
import type { GetLeaderboardResponse } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";

// TODO: use the caller's real group once groups exist.
const DEMO_GROUP_ID = "demo-group";

export default function Leaderboard() {
  const [data, setData] = useState<GetLeaderboardResponse | null>(null);

  useEffect(() => {
    api.getLeaderboard(DEMO_GROUP_ID).then(setData).catch(console.error);
  }, []);

  return (
    <>
      <PageHeader title="Leaderboard" subtitle={data?.group.name} />
      <ol className="space-y-2">
        {data?.entries.map((e) => (
          <li
            key={e.userId}
            className={`flex items-center gap-4 rounded-2xl p-4 shadow-sm lg:p-5 lg:text-lg ${e.isMe ? "bg-emerald-50 ring-2 ring-emerald-500" : "bg-white"}`}
          >
            <span className="w-6 text-center font-bold text-slate-400">{e.rank}</span>
            <span className="flex-1 font-medium">{e.isMe ? "You" : e.displayName}</span>
            <span className="text-sm text-slate-500">{e.streak}🔥</span>
            <span className="w-20 text-right font-semibold">{e.points} pts</span>
          </li>
        ))}
      </ol>
    </>
  );
}
