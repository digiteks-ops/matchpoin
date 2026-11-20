# MATCHPOIN — Feature Status

UI language: Bahasa Indonesia (unchanged). All new error text is mapped to Indonesian.

Status legend: **PASS** = verified by build/unit test; **MANUAL** = requires live Supabase credentials (RLS/auth/e2e); **N/A** = not deployed yet.

| # | Feature | Route / API | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Register (email/password) | `/register` | MANUAL | Supabase Auth; Indonesian messages |
| 2 | Login | `/login`, `/api/auth` | PASS | Form validation + Indonesian error mapping |
| 3 | Logout | `/auth/logout` | PASS | `test:logout` 9/9 |
| 4 | Password reset | `/forgot-password`, `/reset-password` | MANUAL | Supabase Auth email |
| 5 | OAuth (Google/Facebook) | `/auth/callback` | MANUAL | Providers configured in Supabase |
| 6 | Session persists after refresh | middleware | PASS | `updateSession` refresh + cookie rotation |
| 7 | Protected pages | `/dashboard`, `/profile`, `/matches/new`, `/notifications`, `/admin` | PASS | `protected-routes.mjs` + middleware |
| 8 | Profile view/edit | `/profile`, `/profile/edit`, `/api/profile` | PASS | Supabase service; no MySQL |
| 9 | Avatar upload | `/api/assets/*` | MANUAL | Supabase Storage signed upload |
| 10 | Player directory + detail | `/players`, `/players/[id]`, `/api/players` | PASS | Reads `public_players` view |
| 11 | Leaderboard | `/leaderboard`, `/api/leaderboard` | PASS | Rating visibility respected |
| 12 | Match list/detail | `/matches`, `/matches/[id]`, `/api/matches` | PASS | Supabase `getOpenMatches`/`getMatchDetail` |
| 13 | Create match (roster) | `/matches/new`, `/api/matches/create` | PASS | Shared roster invariants; roster tests 12/12 |
| 14 | Join / accept / reject / leave / cancel | `/api/matches/[id]/*` | PASS | Existing Supabase workflows |
| 15 | Invitations | `/api/invites*` | PASS | Send, list, respond, revoke |
| 16 | Match result submit/confirm/dispute | `/api/matches/[id]/*` | PASS | `rating-service` (formula untouched) |
| 17 | Walkover / cancellation | `/api/matches/[id]/walkover` | PASS | Supabase RPCs from 00009 |
| 18 | Rating engine | services | PASS | `test:rating` |
| 19 | Match history + stats | `/api/profile/history` | PASS | `getPlayerStats` |
| 20 | Dashboard | `/dashboard` | PASS | Profile, rating, upcoming, invites |
| 21 | Tournament/league registration | `/tournaments`, `/league`, `/api/tournaments/register` | PASS | RPC `register_for_competition` (pending + approval) |
| 22 | League overview/standings | `/league`, `/api/leagues/[category]` | PASS | Supabase reads |
| 23 | Admin dashboard | `/admin` | PASS | Supabase counts + audit log |
| 24 | Admin settings (users/players/matches/tournaments) | `/admin/settings` | PASS | Supabase reads |
| 25 | Super Admin registration approvals | `/admin/tournaments`, `/api/admin/*` | PASS | Atomic RPC + audit |
| 26 | RBAC (player/admin/super_admin) | `src/lib/supabase/rbac-service.ts` | PASS | RPCs mirror MySQL rules; last Super Admin protected |
| 27 | Notifications (list/read + realtime broadcast) | `/notifications`, `/api/notifications*` | PASS | Supabase table + Realtime broadcast |
| 28 | RLS isolation | all tables | MANUAL | Policies in 00001–00012 + 00013; verify on deployed DB |
| 29 | MySQL data import | `scripts/supabase/migrate-mysql-data.mjs` | MANUAL | Backup-first, idempotent, count + FK validation |

## Manual verification checklist (Phase 4)

1. Register → confirm email → login → refresh page (session persists).
2. As user A, open `/profile`; as user B, confirm A's private data is not readable (RLS).
3. Create match, join from second account, accept, submit result, confirm; rating changes once.
4. Upload avatar (≤5 MB) and match evidence (≤1 MB); signed URLs resolve.
5. Register a doubles league entry; approve from Super Admin; both players notified.
6. Logout; protected routes redirect to `/login`.
7. Confirm every visible string is Indonesian and errors never show raw Supabase text.
