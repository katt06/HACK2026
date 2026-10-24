import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "@contract";

// 256 is a multiple of the 32-character alphabet, so `byte % 32` is unbiased.
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (b) => INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length]).join("");
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/join/${code}`;
}
