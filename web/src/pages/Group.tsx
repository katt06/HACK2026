import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GroupSummary } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { JoinGroupForm } from "../components/JoinGroupForm";
import { inviteLink } from "../lib/inviteCode";

const card = "rounded-3xl bg-white p-5 shadow-sm lg:p-8";

function InviteBox({ group }: { group: GroupSummary }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(group.inviteCode);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${group.name}`, text: `Save with me on Savings Game. Code: ${group.inviteCode}`, url: link });
        return;
      } catch {
        // Share sheet dismissed or unavailable: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  return (
    <div className="rounded-2xl bg-emerald-50 p-4 lg:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Invite code</p>
      <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900 lg:text-5xl">{group.inviteCode}</p>
      <p className="mt-2 truncate text-sm text-emerald-800">{link}</p>
      <button onClick={share} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
        {copied ? "Link copied!" : "Share invite link"}
      </button>
    </div>
  );
}

function GroupCard({ group, fresh }: { group: GroupSummary; fresh: Set<string> }) {
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold lg:text-2xl">{group.name}</h2>
        <span className="shrink-0 text-sm text-slate-500">
          {group.members.length} {group.members.length === 1 ? "member" : "members"}
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {group.members.map((m) => (
            <li
              key={m.userId}
              className={`-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 transition-colors duration-1000 ${fresh.has(m.userId) ? "bg-emerald-100" : ""}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">
                {m.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium">{m.displayName}</span>
              {m.isMe && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">You</span>}
            </li>
          ))}
        </ul>
        <InviteBox group={group} />
      </div>
    </section>
  );
}

function CreateGroupForm({ onCreated }: { onCreated: (g: GroupSummary) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give your group a name.");
    setError("");
    setBusy(true);
    try {
      onCreated(await api.createGroup(name));
      setName("");
    } catch {
      setError("Couldn't create the group right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="Roommates, Book club, …"
        aria-label="Group name"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
        {busy ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}

export default function Group() {
  const location = useLocation();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set()); // userIds that just joined
  const previous = useRef<GroupSummary[] | null>(null);
  const [notice, setNotice] = useState<string>((location.state as { notice?: string } | null)?.notice ?? "");

  // Live member list: announce and briefly highlight anyone who joins one of my groups.
  useEffect(() => {
    setLoadFailed(false);
    return api.watchMyGroups(
      (next) => {
        const joined = next.flatMap((g) => {
          const before = previous.current?.find((p) => p.id === g.id);
          return before ? g.members.filter((m) => !m.isMe && !before.members.some((b) => b.userId === m.userId)).map((m) => ({ m, g })) : [];
        });
        previous.current = next;
        setGroups(next);
        if (joined.length === 0) return;
        setNotice(joined.map(({ m, g }) => `${m.displayName} just joined ${g.name}!`).join(" "));
        const ids = joined.map(({ m }) => m.userId);
        setFresh((s) => new Set([...s, ...ids]));
        setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !ids.includes(id)))), 3000);
      },
      () => setLoadFailed(true),
    );
  }, [retry]);

  // Drop the one-time notice from history so it doesn't reappear on reload.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  return (
    <>
      <PageHeader title="Groups" subtitle="Save alongside friends. They see your progress, never your dollars." />

      {notice && (
        <p role="status" className="mb-4 rounded-2xl bg-emerald-600 px-4 py-3 font-medium text-white">
          {notice}
        </p>
      )}

      <div className="space-y-4">
        {loadFailed && (
          <div className={`${card} text-center`}>
            <p className="text-slate-600">Couldn't load your groups.</p>
            <button onClick={() => setRetry((n) => n + 1)} className="mt-2 font-semibold text-emerald-600">
              Try again
            </button>
          </div>
        )}
        {!groups && !loadFailed && <div className={`${card} animate-pulse text-slate-400`}>Loading your groups…</div>}
        {groups?.length === 0 && (
          <p className={`${card} text-slate-600`}>You're not in a group yet. Start one below, or join a friend's with their code.</p>
        )}
        {groups?.map((g) => <GroupCard key={g.id} group={g} fresh={fresh} />)}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="mb-3 text-lg font-bold">Start a group</h2>
            <CreateGroupForm onCreated={(g) => setNotice(`${g.name} is ready. Share the code to invite friends.`)} />
          </section>
          <section className={card}>
            <h2 className="mb-3 text-lg font-bold">Join with a code</h2>
            <JoinGroupForm
              onJoined={({ group, alreadyMember }) => {
                setNotice(alreadyMember ? `You're already in ${group.name}.` : `You joined ${group.name}!`);
              }}
            />
          </section>
        </div>
      </div>
    </>
  );
}
