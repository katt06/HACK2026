// Small label on challenges whose text Claude wrote for this user (source "llm"). Templates show nothing.
export function ClaudeTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-soft px-2 py-0.5 text-xs font-extrabold text-heading">
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
        <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" className="fill-coin" />
      </svg>
      Written by Claude for you
    </span>
  );
}
