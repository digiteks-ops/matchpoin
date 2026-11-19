# MATCHPOIN — Audit

Scope: Next.js 14 App Router + TypeScript + Tailwind, Supabase Auth/Postgres/Storage/Realtime.
Baseline: `npm run lint` and `npm run build` pass; `npm run typecheck` passes after repairs.

## Critical (fixed)

| Item | Location | Fix |
| --- | --- | --- |
| Runtime data access still hit MySQL from primary screens (`admin`, notifications, tournament registration, player reads) | `src/app/admin/*`, `src/lib/notifications/*`, `src/app/api/tournaments/register`, `src/lib/mysql/public-player-client.ts` | Rewired to Supabase services/RPCs; `/api/mysql/*` are aliases; `/mysql/*` pages redirect |
| Two authentication paths (MySQL RBAC + Supabase Auth) | `src/lib/auth/supabase-auth.ts`, `src/lib/auth/guards.ts` | Single Supabase Auth session; roles read from Supabase RPC |
| Auth redirects pointed to removed `/mysql/auth/*` screens | `src/lib/auth/guards.ts`, `src/lib/auth/protected-routes.mjs` | Canonical `/login`, `/register`, `/dashboard` |
| Middleware had dead MySQL rewrite branch and redirected to MySQL screens | `src/middleware.ts`, `src/lib/supabase/middleware.ts` | Single Supabase session middleware |
| Interrupted-session corruption | `src/components/matches/match-detail-client.tsx`, `src/lib/supabase/middleware.ts` | Template literals/backticks and file structure repaired |
| Missing schema parity (RBAC, notifications, files, registration audit, public view) | `supabase/migrations/00013_restore_supabase_architecture.sql` | Additive, idempotent migration with RLS + atomic RPCs |

## Medium (open, planned)

| Item | Location | Recommendation |
| --- | --- | --- |
| Input validation is hand-written per route | `src/app/api/**` | Adopt `zod` schemas per endpoint (keep Indonesian messages) |
| No rate limiting on auth/registration endpoints | `/api/tournaments/register`, `/api/auth/*` | Add Upstash/Vercel rate limit |
| `NEXT_PUBLIC_*` used only for public URL/anon key | `.env.example` | Keep service role server-only (already correct) |
| Some client pages fetch APIs that could be Server Components | `players`, `leaderboard`, `tournaments`, `league` | Move reads to RSC when interactivity allows |
| Legacy MySQL modules still present | `src/lib/mysql/*`, `scripts/mysql/*`, `mysql/migrations/*` | Keep for rollback; delete only after production sign-off |
| Legacy `/mysql/*` UI replaced by redirects | `src/app/mysql/**` | Remove after confirming no external links |

## Low

- `src/lib/mysql/primary-route-map.ts` is now unused (left for rollback).
- `mysql2`, `@aws-sdk/*` dependencies remain although runtime no longer uses them (removal changes lockfile; defer).
- `tsconfig.tsbuildinfo` is tracked (should be ignored).
- Some console error logging remains in best-effort paths (`logError`, realtime broadcast).
- No `vercel.json`; region should be set to `sin1` at project level.

## Security checks performed

- No `.env*` files staged/committed; `.gitignore` covers `.env`, `.env*.local`, `.next`, `node_modules`.
- Service role key is only imported by server modules (`server-only` / route handlers).
- RLS enabled for new tables; writes to RBAC/notifications go through service role or SECURITY DEFINER RPCs.
- RBAC RPCs enforce: no self-role changes, Super Admin required for admin grants, cannot revoke the last Super Admin, every change audited.
- Registration RPC validates quota, category/gender rules, duplicate entries, and authenticated ownership.
- No SQL string interpolation with user input in Supabase paths (PostgREST builders/RPC parameters).
