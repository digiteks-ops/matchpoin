# MATCHPOIN — Feature Status

UI language: Bahasa Indonesia (unchanged). All new error text is mapped to Indonesian.

Status legend: **PASS** = verified by build/unit test; **MANUAL** = requires live Supabase credentials (RLS/auth/e2e); **N/A** = not deployed yet.

| # | Feature | Route / API | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Register (email/password) | `/register` | MANUAL | Supabase Auth; Indonesian messages |
| 2 | Login | `/login`, `/api/auth` | PASS | Form validation + Indonesian error mapping |
| 3 | Logout | `/auth/logout` | PASS | `test:logout` 9/9 |
| 4 | Password reset | `/forgot-password`, `/reset-password` | MANUAL | Supabase Auth email |
| 5 | OAuth (Google) | `/auth/callback` | MANUAL | Providers configured in Supabase |
| 6 | Session persists after refresh | middleware | PASS | `updateSession` refresh + cookie rotation |
| 7 | Protected pages | `/dashboard`, `/profile`, `/matches/new`, `/notifications`, `/admin` | PASS | `protected-routes.mjs` + middleware |
| 8 | Profile view/edit | `/profile`, `/profile/edit`, `/api/profile` | PASS | Supabase service; no MySQL |
| 9 | Avatar upload | `/api/assets/*` | MANUAL | Supabase Storage signed upload |
| 10 | Player directory + detail | `/players`, `/players/[id]`, `/api/players` | PASS | Reads `public_players` view |
| 11 | Leaderboard | `/leaderboard`, `/api/leaderboard` | PASS | MPR semua pemain terpublish |
| 12 | Match list/detail | `/matches`, `/matches/[id]`, `/api/matches` | PASS | Supabase `getOpenMatches`/`getMatchDetail`; `/matches` also shows public recent match activity (completed matches, both teams, score, winner) via `match-activity-service` |
| 13 | Create match (roster) | `/matches/new`, `/api/matches/create` | PASS | Singles 1v1 and doubles 2v2; shared roster builder; migration 00014 drops the legacy `matches.court_id` NOT NULL constraint |
| 14 | Join / accept / reject / leave / cancel | `/api/matches/[id]/*` | PASS | Existing Supabase workflows |
| 15 | Invitations | `/api/invites*` | PASS | Send, list, respond, revoke |
| 16 | Match result submit/confirm/dispute | `/api/matches/[id]/*` | PASS | `rating-service` (formula untouched) |
| 17 | Walkover / cancellation | `/api/matches/[id]/walkover` | PASS | Supabase RPCs from 00009 |
| 18 | Rating engine (MPR) | services | PASS | Start 1000, K=80 (+40/-40 balanced), 2-match calibration, tiers 0-1099 / 1100-1599 / 1600-1999 / 2000+; `test:rating` |
| 19 | Match history + stats | `/api/profile/history` | PASS | `getPlayerStats` |
| 20 | Dashboard | `/dashboard` | PASS | Profile, rating, upcoming, invites |
| 21 | Tournament/league registration | `/tournaments`, `/league`, `/api/tournaments/register` | PASS | IKA17 4 categories (Single Man, Double Man, Double Woman, Double Mix), no level selection, quota 24 per category, pending/accepted/rejected, gender and partner rules |
| 22 | League overview/standings | `/league`, `/api/leagues/[category]` | PASS | Supabase reads; class (Beginner < 1100 MPR, Intermediate >= 1100) derived from match results, doubles use team average MPR |
| 23 | Admin dashboard | `/admin` | PASS | Supabase counts + audit log |
| 24 | Admin settings (users/players/matches/tournaments) | `/admin/settings` | PASS | Supabase reads |
| 25 | Admin registration approvals | `/admin/tournaments`, `/api/admin/*` | PASS | Admin/super_admin guard, atomic RPC, quota enforcement + audit |
| 25a | IKA17 league admin | `/admin/tournaments/[id]` | PASS | Category tabs, accept/reject, quota, edit dates, create/cancel matches |
| 25b | Admin seed + IKA17 seed | `npm run db:seed-admin` | PASS | `ADMIN_EMAIL`/`ADMIN_PASSWORD` from env; Supabase Auth hashes the password |
| 26 | RBAC (player/admin/super_admin) | `src/lib/supabase/rbac-service.ts` | PASS | RPCs mirror MySQL rules; last Super Admin protected |
| 27 | Notifications (list/read + realtime broadcast) | `/notifications`, `/api/notifications*` | PASS | Supabase table + Realtime broadcast |
| 28 | RLS isolation | all tables | MANUAL | Policies in 00001–00013, rewritten chat policies in 00015, registration RLS in 00017; verify on deployed DB |
| 29 | MySQL data import | `scripts/supabase/migrate-mysql-data.mjs` | MANUAL | Backup-first, idempotent, count + FK validation |
| 30 | Google login | `/login`, `/register`, `/auth/callback` | PASS | Supabase OAuth, profiles trigger (00018), Indonesian error states; `test:supabase-oauth` |
| 31 | Avatar + match-result uploads | `/profile/edit`, match result form | PASS | Client compression ≤300 KB/WebP, `avatars`/`match-results` buckets + policies (00019), old-file cleanup; `test:supabase-storage` |

## Manual verification checklist (Phase 4)

1. Register → confirm email → login → refresh page (session persists).
2. As user A, open `/profile`; as user B, confirm A's private data is not readable (RLS).
3. Create match, join from second account, accept, submit result, confirm; rating changes once.
4. Upload avatar (≤5 MB) and match evidence (≤1 MB); signed URLs resolve.
5. Register a doubles league entry; approve from Super Admin; both players notified.
6. Logout; protected routes redirect to `/login`.
7. Confirm every visible string is Indonesian and errors never show raw Supabase text.
