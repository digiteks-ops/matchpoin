# MATCHPOIN V2 — Tennis Matchmaking Platform

MATCHPOIN helps tennis players in Makassar (and beyond) arrange their own matches, find suitable opponents, submit results, and track an independent rating.

**Connect. Compete. Improve.**

---

## Current status (MVP)

### Implemented
- Next.js 14 App Router + TypeScript + Tailwind, mobile-first UI.
- Supabase Auth (email/password), protected routes, server-side session refresh.
- Google/Facebook OAuth code + PKCE callback (`/auth/callback`), shown only when providers are enabled in Supabase.
- Public player directory built from `player_profiles` + `player_ratings` (no email/phone exposure).
- Leaderboard from public ratings.
- Match scheduling: list, create, detail, join request, organizer accept/reject, cancel.
- Invitations: invite a player from the directory or their profile, accept/decline on the dashboard or match page, organizer can revoke.
- Match results: submit score + photos, 48-hour opponent dispute window, confirm, auto-confirm, under-review state.
- Photo upload with client-side compression to ≤ 1 MB per image.
- Rating engine (Elo-style, 1.00–10.00) with provisional players, singles/doubles, upset weighting.
- Match history, player statistics, dashboard with rating, record, upcoming matches, invites, and recent results.
- Profile completion, avatar upload, editable tennis profile.
- Security headers, `.gitignore`, server-only Supabase client usage in services.
- Server-side onboarding (`player-sync.ts`) that creates the `users` / `player_profiles` / `player_ratings` rows a new account needs before it can create a match.
- Short, action-specific error messages with technical detail written to the developer log only (`src/lib/errors.ts`).

### Requires configuration before full runtime
- **Apply `supabase/migrations/00004_match_workflow.sql`.** Until it runs:
  - Result submission returns `42501` (`match_results` has no policy).
  - `apply_match_rating_change` does not exist (404), so confirmed results cannot persist ratings.
  - The signup trigger (`on_auth_user_created`) is missing. The app covers this with server-side onboarding (`src/lib/services/player-sync.ts`, service role), so registration and creating a match already work; the trigger is the belt-and-braces fix.
- **Enable Google/Facebook providers** in Supabase → Authentication → Providers, and add the redirect URL:
  - App: `https://<your-domain>/auth/callback` (production), `http://localhost:3000/auth/callback` (development)
  - Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`
- **Storage bucket `avatars`** must allow authenticated uploads (used for avatars and match photos).
- **`SUPABASE_SERVICE_ROLE_KEY`** must be present on the server (onboarding + `scripts/e2e-flows.mjs`); it is never sent to the browser.

### Not yet implemented / intentionally out of scope
- Monetization, payments, subscriptions.
- Native mobile apps.
- Automated push/email reminders for the 48-hour dispute window (auto-confirm runs when the match detail is opened).
- Admin moderation UI for "Under Review" disputes.

---

## Architecture

```
src/
  app/
    (auth)/            login, register, forgot-password, reset-password
    (protected)/       dashboard, profile, profile/edit
    api/               health, matches/*, profile/history
    auth/callback/     OAuth PKCE code exchange
    matches/           list, create, detail
    leaderboard/       public ranking
    players/           public directory + detail
  components/
    auth/              OAuth buttons
    layout/            navbar, footer, logo
    matches/           create form, photo upload, match detail client
    players/           player card + skeleton
    ui/                button, card, input, badge, modal, etc.
  lib/
    matches/           shared match types/constants (client-safe)
    rating/            rating engine
    services/          match, result/rating, history, player sync
    supabase/          browser, server, middleware clients
    utils/             image compression
```

### Data flow
- Browser components use `src/lib/supabase/client.ts`.
- Server components, route handlers, and services use `src/lib/supabase/server.ts` (cookie-bound).
- Match mutations are server-side only; the client sends intent, the server validates participants, deadlines, and ratings.

### Invitation flow
Invites are stored as `match_participants` rows with `metadata.status = 'invited'`
(no extra table, so no schema change):

1. The organizer invites a player from `/players/[id]` or `/players`; the flow
   opens `/matches/new?invite=<userId>`, creates the match, then calls
   `POST /api/matches/[id]/invite`.
2. The invitee sees the invite on the dashboard and on the match page and calls
   `POST /api/invites/[id]/respond` with `accept` or `decline`.
3. Accepting sets `metadata.status = 'confirmed'`; declining sets `'declined'`.
   Neither action deletes the row: `match_participants` has no DELETE policy
   under RLS, so status changes are the supported way to remove a participant.
4. The organizer sees pending invites on the match page and can revoke one with
   `POST /api/matches/[id]/reject` (marks `rejected`).
5. Displayed rosters and capacity come from confirmed participant rows, not from
   `matches.current_players`, because a trigger maintains that counter for every
   row (including pending and invited ones).

### Match result workflow
1. A participant submits a score. The server stores `match_results.status = 'pending'` and `metadata.dispute_deadline = submitted_at + 48h`.
2. The opponent can confirm or dispute within 48 hours.
3. If no action is taken, opening the match detail triggers `/api/matches/[id]/sync`, which auto-confirms using **server time**.
4. On confirmation, `applyVerifiedMatchRatings` computes ratings from the current `player_ratings` rows and persists them through `apply_match_rating_change` (SECURITY DEFINER), then marks the match `completed`.

### Rating
- Logistic expected score, K-factor 0.32 (established) / 0.64 (provisional, first 5 matches).
- Ratings clamped to `1.00–10.00`.
- Doubles use team averages.
- `rating_history` is unique per `(match_id, user_id)` to prevent duplicate application.

---

## Setup

```bash
npm install
cp .env.example .env.local
# fill Supabase URL, publishable/anon key, service role key
npm run dev
```

### MySQL migration foundation

The application still uses Supabase. The MySQL connection and migration scripts
are groundwork only; they do not switch application reads/writes or modify the
Supabase database. Configure the server-only `DATABASE_URL` in `.env.local`
before running either command:

```bash
npm run db:check
npm run db:migrate
```

`db:check` verifies connectivity and MySQL 8.0+. `db:migrate` creates the
`matchpoin_schema_migrations` history table and applies reviewed SQL files in
`mysql/migrations/`. The initial fresh-start migrations create account, city,
court, player-profile, rating, match, result, tournament, league, and related
workflow tables, and seed reference cities. They do not import Supabase
accounts or application data. MySQL DDL can implicitly commit, so a failed
migration may be partially applied and must be inspected before retrying. Do
not point these commands at production without an approved migration plan.

Auth.js Credentials and MySQL registration endpoints are being built alongside
the migration, but the current login/register UI and route protection still use
Supabase. Do not direct users to the new authentication endpoints until the
remaining application data services and authorization checks have been moved
and tested. Configure a private `AUTH_SECRET` before enabling Auth.js.

The current approved approach is a fresh MySQL start: existing Supabase
accounts and application data will not be imported, and the Supabase project
and Storage must remain untouched as a fallback. A Supabase backup is therefore
not a prerequisite for this path. If a future task requires a database backup,
configure `SUPABASE_DB_URL` and an access-controlled `MATCHPOIN_BACKUP_DIR`
outside the repository, then run `npm run db:backup:supabase`. This requires
PostgreSQL client tools (`pg_dump` and `pg_restore`) on `PATH`; the command
verifies the custom dump archive but does not back up Supabase Storage objects
or prove a restore succeeds.

See [docs/mysql-migration-plan.md](./docs/mysql-migration-plan.md) for the
proposed schema mapping, auth/storage decisions, verification, and rollback
approach.

### Supabase
1. Create a project.
2. Apply the live schema. The repo's `00001`–`00003` migrations are stale and **must not be run**.
3. Apply `supabase/migrations/00004_match_workflow.sql`.
4. Create a public Storage bucket named `avatars`.
5. Enable Google and Facebook providers and register the redirect URLs above.

### Environment
| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (server/migrations only; never expose) |
| `NEXT_PUBLIC_APP_URL` | Base URL for links |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `Asia/Makassar` |

---

## Scripts

```bash
npm run dev        # development
npm run build      # production build
npm run start      # production server
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test:rating # rating engine test suite (20 assertions)
npm run test:stats # node scripts/test-player-stats.mjs <userId-uuid>
node scripts/e2e-flows.mjs # 38 end-to-end checks against a running server
```

`e2e-flows.mjs` creates throwaway auth users, exercises create/invite/accept/
decline/join/reject/cancel over HTTP, asserts the landing copy, and cleans up.
It requires the production server to be running on `http://localhost:3000`.

---

## Known issues / cleanup needed

- **Migration 00004 not applied.** Results, dispute confirmation, and rating persistence need it (the signup trigger is the only part already covered by the app). No Supabase CLI, `psql`, or database connection string is available in this environment and PostgREST cannot execute DDL — run the file from the Supabase dashboard SQL editor.
- `users` has no INSERT policy under RLS (confirmed: 403 for every column combination, while updating one's own row succeeds). The app works around this with the service role; applying migration 00004 adds the policy and the trigger.
- A trigger on `match_participants` bumps `matches.current_players` on every insert and decrements it on delete, and a check constraint caps it at `matches.max_players`. The app stores `max_players` with +2 headroom and derives the displayed roster from confirmed rows.
- `matchpoin-v2/` is a leftover scaffold containing only `package.json` and can be removed.
- Node.js 20 triggers a Supabase deprecation warning; Node 22+ is recommended.
- `npm run lint` is not configured (no ESLint config in the repo); `npm run typecheck` and `npm run build` are the available checks.

---

## Brand

- Navy `#0B1F44`, tennis green `#A6FF00`.
- Plus Jakarta Sans / Inter.
- Logo: `src/components/layout/logo.tsx`.
- Marketing copy: `marketing/`.