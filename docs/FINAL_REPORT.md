# MATCHPOIN — Final Report (Phase 0–4, branch `refactor/supabase-lean`)

Live: https://matchpoin.vercel.app
Stack: Next.js 14 App Router + TypeScript + Tailwind + Supabase (Auth, Postgres, Storage, Realtime) + Vercel.

## What shipped

| Area | Result |
| --- | --- |
| Auth | Email/password, Google & Facebook OAuth with profile auto-creation (`00018`), Indonesian error states, `/auth/login` → `/login` redirect, auth error boundary |
| Roles & admin | `role` column + self-escalation trigger, `is_admin()` helpers, admin-only registration RLS (`00017`), dedicated `/admin` layout with server-side guards, filters, bulk accept/decline, stats, activity log |
| Tournaments | Liga Tennis IKA17 categories, pending → accepted/rejected workflow, audit log, quota counts accepted only, optional decline reason (`00014`, `00016`) |
| Matches | Singles private + Open Match (open opponent slot), doubles rosters, race-safe joins (`join_match` row lock), host notification on join, host name + avatar on cards |
| Chat | RLS recursion fixed with `is_conversation_member()` (`00015`), realtime cleanup, polling only while disconnected |
| Uploads | Client compression (≤300 KB, WebP, 1280/512 px), 10 MB original cap, `avatars` + `match-results` buckets with owner/participant policies (`00019`), old-file deletion |
| Performance | Participant embedding (3→2 queries), explicit columns, limits, 7 hot-path indexes, `(select auth.uid())` policies (`00021`, `00022`), `React.cache` session/role, 13 route skeletons, dynamic imports, cached cities, Vercel region `sin1` |
| QA | 17 offline test suites (PASS), static RLS audit (FAIL 0 / WARN 0), 8 Playwright specs written (BLOCKED without accounts/tools), `verify:live` orchestrator, SQL verification script |

## Migrations

`00001`–`00013` schema + RBAC/notifications/storage metadata · `00014` league model · `00015` chat RLS · `00016` registration write path · `00017` admin role/RLS · `00018` OAuth trigger · `00019` storage buckets/policies · `00020` explain tool · `00021` indexes + RLS optimisation · `00022` RLS hardening (25 policies + legacy league policy fix).

All current files are idempotent/re-runnable. Apply in numeric order on a fresh project.

## Security posture

- RLS enabled on all 27 public tables; no policy uses bare `auth.uid()` (audited).
- All `SECURITY DEFINER` functions pin `search_path`.
- Players cannot change their own `role` (trigger + column revoke); admin pages/routes require a server-side role check; middleware protects `/admin`.
- Storage writes are pinned to the caller's folder; `match-results` writes require match membership.
- Chat reads and registration reads are limited to the caller (or admins).

## Commands

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run test:supabase-rls
npm run audit:rls
npm run build
npm run verify:live          # live checks; FAIL exits non-zero
npm run test:e2e:playwright  # requires accounts + migrations
```

## Known risks / still unverified

1. No live execution of OAuth, uploads, registration approval, Open Match join, or Lighthouse — requires real keys/accounts.
2. Local `SUPABASE_SERVICE_ROLE_KEY` returned HTTP 401 (must be re-copied); `NEXT_PUBLIC_SUPABASE_URL` had a `/rest/v1` suffix (fixed in `.env`).
3. Playwright selectors may need small adjustments on the first real run.
4. `verify:live` cannot check `00016`/`00022` over REST; run `supabase/verify/phase4.sql` in the SQL Editor.
5. Legacy MySQL modules and the `match-evidence` bucket are intentionally kept for rollback.
6. City-list duplicate query was proposed but not consolidated: `getActiveCities()` uses the service role, so swapping `profile-service` to it would add a new failure mode when that key is absent.

## Release status — 2026-11-22

- E2E release suite (auth, admin, profile, tournament, match, security, edge): **15 passed, 3 skipped, 0 failed**.
- Open-slot join + 3-way concurrent join: PASS (after `00024` enum cast and `00025` notification enum).
- Fixed during QA: profile loader self-retrigger, OAuth avatar hosts, match-create navigation, "Ajukan Slot" selector, submit-enabled wait.
- Build: 55/55 pages.
- Not automated: `uploads.spec.ts` (would overwrite a real profile photo); run manually with a dedicated account.

## Manual steps

See `docs/SETUP-CHECKLIST.md` (env, migrations, test accounts, Playwright, deploy, OAuth, mobile) and `supabase/verify/phase4.sql` (read-only DB verification).
