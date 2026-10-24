import { useEffect, useState } from "react";
import type { GetSafeToSaveResponse } from "@contract";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/AppLayout";
import { formatCents, formatDate } from "../lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<GetSafeToSaveResponse | null>(null);

  useEffect(() => {
    api.getSafeToSave().then(setData).catch(console.error);
  }, []);

  const firstName = user?.displayName?.split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Hi, ${firstName}` : "Hi there"} subtitle="Here's what you can set aside today." />
      <section className="rounded-3xl bg-emerald-600 p-6 text-white shadow-sm lg:p-10">
        <p className="text-sm font-medium text-emerald-100 lg:text-base">Safe to save</p>
        <p className="mt-1 text-5xl font-bold tracking-tight lg:text-7xl">{data ? formatCents(data.amount) : "—"}</p>
        {data && <p className="mt-2 text-emerald-100">Next payday {formatDate(data.nextPayday)}</p>}
      </section>
      {data && (
        <ul className="mt-6 space-y-2 lg:text-lg">
          {data.explanation.map((line) => (
            <li key={line} className="rounded-2xl bg-white p-4 shadow-sm">
              {line}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
