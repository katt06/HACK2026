import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GroupSummary } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { JoinGroupForm } from "../components/JoinGroupForm";
import { EmptyState } from "../components/EmptyState";
import { inviteLink } from "../lib/inviteCode";

const card = "card p-5 lg:p-8";

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
    <div className="rounded-2xl bg-primary-soft p-4 lg:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-link">Invite code</p>
      <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em] text-heading lg:text-5xl">{group.inviteCode}</p>
      <p className="mt-2 truncate text-sm text-heading">{link}</p>
      <button onClick={share} className="btn btn-primary btn-sm mt-3">
        {copied ? "Link copied!" : "Share invite link"}
      </button>
    </div>
  );
}

function GroupCard({ group, fresh }: { group: GroupSummary; fresh: Set<string> }) {
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-extrabold lg:text-2xl">{group.name}</h2>
        <span className="shrink-0 text-sm text-ink-muted">
          {group.members.length} {group.members.length === 1 ? "member" : "members"}
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {group.members.map((m) => (
            <li
              key={m.userId}
              className={`-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 transition-colors duration-1000 ${fresh.has(m.userId) ? "bg-primary-soft" : ""}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 font-semibold text-ink-muted">
                {m.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium">{m.displayName}</span>
              {m.isMe && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-extrabold text-heading">You</span>}
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
        className="field"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-secondary w-full">
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
        <p role="status" className="mb-4 rounded-2xl border-2 border-mint bg-primary-soft px-4 py-3 font-extrabold text-heading">
          {notice}
        </p>
      )}

      <div className="space-y-4">
        {loadFailed && (
          <div className={`${card} text-center`}>
            <p className="text-ink-muted">Couldn't load your groups.</p>
            <button onClick={() => setRetry((n) => n + 1)} className="mt-2 font-semibold text-link">
              Try again
            </button>
          </div>
        )}
        {!groups && !loadFailed && <div className={`${card} animate-pulse text-ink-faint`}>Loading your groups…</div>}
        {groups?.length === 0 && (
          <EmptyState mascot="drink" title="Saving's better together">
            Start a group below, or join a friend's with their code.
          </EmptyState>
        )}
        {groups?.map((g) => <GroupCard key={g.id} group={g} fresh={fresh} />)}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Start a group</h2>
            <CreateGroupForm onCreated={(g) => setNotice(`${g.name} is ready. Share the code to invite friends.`)} />
          </section>
          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Join with a code</h2>
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
