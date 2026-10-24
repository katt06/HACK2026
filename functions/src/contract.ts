// Shared contract between /web and /functions.
// The web app imports this file type-only via the `@contract` alias,
// so keep it free of runtime imports.

export interface HealthResponse {
  ok: true;
  time: string;
}

export const CALLABLES = {
  health: "health",
} as const;
