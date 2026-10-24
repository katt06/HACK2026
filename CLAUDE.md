# Project: Social savings game (hackathon)

## Stack
- Frontend: React + TypeScript + Vite, React Router, Tailwind. PWA-capable.
- Backend: Firebase Auth, Firestore, Cloud Functions (2nd gen, TypeScript, Node 24), Hosting.
- Local dev always runs against the Firebase Emulator Suite.

## Repo layout
- /web: React app
- /functions: Cloud Functions
- /functions/src/contract.ts: shared types, constants, and small pure helpers, imported by /web via the Vite alias `@contract`. It must not import anything, so it stays safe to bundle on both sides.
- /web/src/api: the only place the web app talks to the backend (Firestore data and callables). Components import from `api/index.ts` and never touch Firestore or httpsCallable directly.
- /scripts: seed data and bandit simulation

## Non-negotiable rules
- API keys (LLM, Plaid) live only in Functions via `defineSecret`. Never in /web.
- `transactions` and `recurring` are server-only. Clients cannot read them.
- Group members can read only the `scores` collection. Scores never contain dollar amounts.
- Enforce privacy with Firestore security rules, not by hiding things in the UI.
- The LLM only sees aggregated category summaries, never merchant-level transactions.
- Every LLM call has a per-user rate limit and a template fallback, so the UI never shows an error.
- Product voice: "coach, not financial advisor." No investment or debt advice. Never suggest cutting groceries, medicine, rent, utilities, or insurance.

## Data model
- users/{uid}: displayName, baselineSpendByCategory, settings
- goals/{id}: ownerId, name, targetAmount, currentAmount, deadline, verified, sizingRecommendation, pausedUntil, createdAt
- goals/{id}/entries/{id}: kind (contribution | expense), amount, note, createdAt; contributions have verified (clients can only write false); expenses have choice (pause | lowerPace), weeksLater
- accounts/{uid} (server-only): userId, currentBalance, asOf
- transactions/{id} (server-only): userId, amount, category, merchant, date, recurringId
- recurring/{id} (server-only): userId, merchant, amount, cadence, nextDue, category, isPayday
- challenges/{id}: userId, type, description, points, difficulty, status, completedAt, reason
- banditStats/{uid_type_difficulty}: userId, challengeType, difficulty, attempts, completions
- groups/{id}: name, members[], memberNames{uid: displayName}, inviteCode (6 chars, created client-side; joined only via the joinGroup callable)
- scores/{uid}: userId, goalProgressPct, streak, improvementScore, points, level
- scoreViewers/{uid} (server-only): uids[] of everyone who shares a group with uid; lets rules check score access

## Callable functions (contract)
getSafeToSave, getChallenges, completeChallenge, getLeaderboard, joinGroup

## Conventions
- Small, pure, unit-tested functions for the logic (forecast, scoring, recurring, bandit). Use Vitest.
- Don't add dependencies without saying why.
- Before writing code, list the files you'll create or change.