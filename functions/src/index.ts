import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import type { HealthResponse } from "./contract.js";

initializeApp();

export const health = onCall((): HealthResponse => {
  return { ok: true, time: new Date().toISOString() };
});
