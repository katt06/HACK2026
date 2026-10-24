import type { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "@contract";

// Mirrors the contract constants. The type annotations fail to compile if they drift.
const ALPHABET: typeof INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH: typeof INVITE_CODE_LENGTH = 6;

// 256 is a multiple of the 32-character alphabet, so `byte % 32` is unbiased.
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// Same rules as the server: ignore case, spaces and dashes. Returns null if malformed.
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  const valid = code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c));
  return valid ? code : null;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/join/${code}`;
}
