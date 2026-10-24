import type { GroupDoc } from "../contract.js";

// Everyone who shares at least one group with uid (not uid itself), sorted for stable writes.
export function scoreViewersFor(uid: string, groups: Pick<GroupDoc, "members">[]): string[] {
  const viewers = new Set<string>();
  for (const group of groups) {
    if (group.members.includes(uid)) for (const member of group.members) viewers.add(member);
  }
  viewers.delete(uid);
  return [...viewers].sort();
}
