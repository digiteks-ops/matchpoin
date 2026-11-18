# MySQL migration plan

## Current boundary

The primary screens continue to use Supabase for their database,
authentication, and file storage. Parallel MySQL-backed screens and APIs are
available under `/mysql` without redirecting primary traffic or importing
data. Do not switch production traffic or remove Supabase before explicit
cutover approval.

The selected database driver is `mysql2`, using prepared statements for
application queries. There is no existing ORM to preserve, so this phase does
not add one or port data-access services prematurely.

## Approved direction: fresh MySQL start

The user chose to start with an empty MySQL application database and leave the
existing Supabase project and its Storage untouched as a fallback. Do not
import existing accounts, profiles, matches, ratings, rankings, or files. New
users will register in the new Auth.js/MySQL system; existing Supabase accounts
will not automatically work there.

Because this path does not read or modify Supabase data, a Supabase backup and
restore drill are not prerequisites for building the fresh database. The
backup tooling remains available if a future data import or deletion is
considered. Never delete or disable the existing Supabase project or Storage
as part of this fresh-start work.

The app is still extensively coupled to Supabase Auth, PostgREST, Storage, and
RLS. Do not switch authentication alone: that would leave many pages and API
routes unusable. Before cutover, the migration must:

1. Create a fresh MySQL schema and Auth.js email/password accounts with signed
   JWT sessions.
2. Replace Supabase Auth/RLS checks across pages and routes with server-side
   authentication and authorization.
3. Move application reads and writes to parameterized MySQL services while
   preserving match, rating, league, tournament, profile, and player flows.
4. Configure and verify Cloudflare R2 for new avatar and match-evidence
   uploads. Use a private bucket, short-lived signed URLs, and browser CORS
   limited to the app origins. Existing Supabase objects remain untouched.
5. Test registration, login, password recovery, sessions, permissions, and
   feature behavior against an empty MySQL database before an explicit
   application cutover.

Keep Supabase configured and unchanged until the new application passes these
checks and cutover is explicitly approved.

## Initial schema mapping

No existing rows will be imported under the approved fresh-start direction.
The following is a first-pass feature schema inventory for implementing the
new MySQL tables:

| Existing data | MySQL target |
| --- | --- |
| Supabase Auth users and `public.users` | A single account identity model plus profile attributes; use the selected Auth.js Credentials provider for new MySQL accounts. |
| `cities`, `tennis_courts` | Reference tables with unique keys and indexes. |
| `player_profiles`, `player_ratings`, `rating_history` | Profile, current-rating, and immutable rating-history tables with foreign keys and rating constraints. |
| `matches`, `match_participants`, `match_results` | Match, roster, and verified-result tables; preserve status transitions and participant uniqueness. |
| `tournaments`, `tournament_participants`, `league_pairings`, `league_standings` | Competition, entry/team, challenge, and standings tables with quota and anti-rematch constraints. |
| `match_wo_reports`, `match_cancellation_requests`, `feedback` | Auditable workflow records with reviewer/decision fields. |
| `conversations`, `conversation_members`, `messages` | Private conversation and membership tables with member-scoped access. |

Type conversion and implementation notes:

- Keep UUID values stable; `CHAR(36)` is the lowest-change initial representation.
- Store timestamps in UTC and convert to/from `Asia/Makassar` at application
  boundaries.
- Map PostgreSQL `JSONB` to MySQL `JSON`; normalize PostgreSQL arrays into child
  tables where they need querying or constraints.
- Preserve `DECIMAL` ratings and enforce the 1.00–10.00 range.
- Rebuild PostgreSQL partial unique indexes using MySQL-compatible generated
  columns or transactional service checks plus unique keys.
- Replace PostgreSQL RPCs and RLS with parameterized server-side services,
  database transactions/locking, foreign keys, and explicit authorization
  checks. Never rely on client-side validation for these rules.

This is a logical feature mapping, not a claim that the checked-in Supabase
migrations represent the live database. Use the application's actual queries
and expected workflows to design the new schema; do not run the Supabase SQL
files against MySQL.

## Authentication and storage decisions

The selected identity system is Auth.js with new MySQL-backed users and a
signed JWT session strategy, as required for the email/password Credentials
provider. Existing Supabase users and password hashes will not be imported;
they must create new accounts in the fresh system. Active Auth.js sessions
will not be database rows; use short, bounded session lifetimes and rotate the
Auth.js secret when required. Do not copy tokens or service-role secrets into
MySQL or client bundles.

Cloudflare R2 is selected for new asset uploads. Configure `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` only in
`.env.local` or the deployment secret store. Use a private bucket and configure
CORS for the development and production app origins, `GET`/`PUT`/`HEAD`, and
the `Content-Type` request header. The parallel MySQL API issues five-minute
scoped image-upload URLs, stores avatar and evidence object keys in MySQL, and
issues one-hour signed read URLs. Match-evidence uploads are limited to the
match organizer and each object key is scoped to the match and user. Existing
Supabase objects are not copied, modified, or deleted. R2 production
credentials and CORS still need to be configured and a real browser
upload/download needs verification before cutover.

MySQL password recovery is implemented as a parallel flow using provider-neutral
SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and
`SMTP_FROM`). Migration `0007` stores only SHA-256 token hashes and HMAC-based
rate-limit subjects; migration `0008` adds an Auth.js session version.
Recovery links expire after 30 minutes and are single-use; requests are limited
to three per email and ten per IP per hour, with reset submissions limited to
twenty per IP per hour. A successful reset increments the version so existing
Auth.js JWT sessions are rejected on their next server-side auth check. The endpoints are
`/api/mysql/auth/password-reset/request` and
`/api/mysql/auth/password-reset/confirm`. Isolated smoke-test pages are
available at `/mysql/auth/forgot-password` and `/mysql/auth/reset-password`;
the primary forgot/reset screens use Supabase by default and redirect to the
MySQL screens when the opt-in primary-backend switch is set. SMTP credentials
and real delivery still need to be configured and verified.

To configure R2, create a private bucket in Cloudflare, then create an
R2-scoped API token with object read/write access limited to that bucket.
Configure bucket CORS for `http://localhost:3000` and the production app origin,
allow `GET`, `PUT`, and `HEAD`, and allow the `Content-Type` header. Put the
account ID, access key ID, secret access key, and bucket name into `.env.local`;
do not paste credentials into chat or commit them.

## Migration and rollback procedure

1. Create and test versioned MySQL migrations against the empty local database.
   Review every SQL file before running `npm run db:migrate`.
2. Implement all required account, profile, match, result, rating, league,
   tournament, and supporting services without importing Supabase rows.
3. Configure and test Cloudflare R2 for new file uploads; leave existing
   Supabase objects untouched.
4. Run registration, login, password recovery, authorization, workflow, and
   feature-parity tests against clean MySQL data.
5. Switch application traffic only with explicit approval. Keep the old
   Supabase project and storage unchanged for rollback.

MySQL DDL can implicitly commit; a failed migration may have partially applied.
The runner records successful files and checks SHA-256 checksums, but it does
not claim transactional rollback for DDL. Inspect database state and author a
forward-fix migration rather than editing an already-applied file.

## Configuration and checks

Set `DATABASE_URL` only in `.env.local` or the deployment secret store. Use a
dedicated least-privilege MySQL account. Non-local hosts must configure TLS
using mysql2's `ssl` URL option, for example
`?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D` (JSON URL-encoded). The example
value in `.env.example` is a local placeholder. URL-encode special characters
in the username and password.

- `npm run db:check` verifies connection and MySQL 8.0+.
- `npm run db:migrate` creates the migration-history table and applies reviewed
  `mysql/migrations/NNNN_description.sql` files.
- `npm run db:backup:supabase` creates a verified PostgreSQL custom-format
  archive outside the repository. It does not back up Supabase Storage bytes
  or replace a restore drill.

The initial fresh-start migrations create account, city, court, player-profile,
rating, match, result, tournament, league, and related workflow tables and
seed reference cities. Migration `0005` adds the `public_players` view;
migration `0006` preserves profile privacy and hides rating fields when
`show_rating` is false; migrations `0007` and `0008` add password recovery and
session invalidation; migration `0009` adds the public verification flag.
Public player, player-detail, and leaderboard data are available under
`/api/mysql/players`, `/api/mysql/players/[id]`, and `/api/mysql/leaderboard`.
The primary directory, player detail, and leaderboard screens can be switched
to these APIs with `NEXT_PUBLIC_PLAYER_READ_BACKEND=mysql`; the default remains
`supabase`. Separate `/mysql` player and leaderboard screens use MySQL data.
MySQL connectivity, workflow, and migration tests have passed.
`NEXT_PUBLIC_MATCHPOIN_APP_BACKEND` currently defaults to `supabase`. Setting
it to `mysql` redirects the supported primary page routes to their `/mysql`
screens, uses the Auth.js session in the shared navigation, and bypasses the
Supabase session middleware. Keep it on `supabase` until the cutover gates
below are met and the switch is explicitly approved.
No Supabase account or
application data has been imported. A Supabase backup is not required for the
approved empty-database path and has not been performed.

The Auth.js/MySQL league-registration endpoint is available at
`/api/mysql/tournaments/register` alongside the existing Supabase route. The
MySQL league overview is available at `/api/mysql/leagues/[category]`, and
tournament categories and registration counts are available at
`/api/mysql/tournaments`. Public partner candidates are exposed at
`/api/mysql/tournaments/[id]/partners`; the competition service includes
transactional standings recomputation. An open match-list and public
upcoming-match detail endpoints are also available under
`/api/mysql/matches`, with creation at `/api/mysql/matches/create` and
transaction-locked join/leave at `/api/mysql/matches/[id]/join` and `/leave`.
Organizer accept/reject/cancel/invite and invite responses also have parallel
MySQL routes. Match-result submission, opponent confirmation, dispute handling,
atomic rating-history updates, elapsed-window auto-confirmation, and walkover
recording now also have parallel MySQL routes. The rating engine remains
shared with the existing application; rating changes, match completion, and
league-standings refresh run in the confirmation transaction.
`npm run test:mysql-workflows` exercises result submission, confirmation,
rating history, duplicate protection, disputes, auto-confirmation, and
walkovers, player-history aggregation, and tournament listing/registration,
profile read/update, using rows rolled back after the test. Authenticated
profile read/update and match-history statistics are available at
`/api/mysql/profile` and `/api/mysql/profile/history`. The dedicated `/mysql` screens use these MySQL paths; keep Supabase as the
active primary application backend until the remaining feature paths are
migrated and verified together. MySQL connections set their session timezone
to UTC to match the timestamp storage policy.

An isolated Auth.js/MySQL account flow is available at `/mysql/auth/register`,
`/mysql/auth/login`, and `/mysql/auth/session`. Registration creates a new
MySQL account and player records, then starts a Credentials-provider session
and opens `/mysql/dashboard`; the session page verifies the identity and
supports logout.
MySQL password-recovery screens now return to the MySQL login page. These
routes bypass the Supabase session middleware. The primary `/login` and
`/register` pages and the rest of the app remain on Supabase by default; the
opt-in primary-backend switch routes supported pages to MySQL. The account flow
has not yet been enabled as the production default.

The authenticated MySQL profile can be viewed and edited at `/mysql/profile`
and `/mysql/profile/edit`. These pages use the MySQL profile API and preserve
its input validation and transaction handling. Avatar upload remains gated on
R2 configuration; the main Supabase profile screens are unchanged.
The MySQL dashboard at `/mysql/dashboard` shows account ratings and recent
match history and links to the MySQL profile, match, player, and invitation
screens. Open doubles can be listed at `/mysql/matches`; match creation also
supports private singles and private doubles at `/mysql/matches/new`.
`/mysql/my-matches` lists the signed-in user's matches, while match detail
supports joining, organizer invitations, request review, and cancellation.
Players can respond to invitations at `/mysql/invites`. Participant-only
result pages at `/mysql/matches/[id]/result` support score submission,
opponent confirmation, and disputes. The workflow tests cover match creation,
private access, invitation response, and rating privacy. Submitting evidence
or changing avatars still requires working R2 credentials and bucket CORS, so
real browser upload/download has not yet been verified.
Competition categories can be registered at `/mysql/tournaments`, and
standings and participants can be viewed at `/mysql/league`. Doubles
registration requires selecting an eligible MySQL partner.
Public MySQL player discovery and the privacy-filtered leaderboard are
available at `/mysql/players`, `/mysql/players/[id]`, and
`/mysql/leaderboard`. Hidden ratings are excluded from the leaderboard, and
no private email fields are exposed by these screens.
MySQL match creation supports open doubles, private singles, and private
doubles with a selected roster. Organizers can invite eligible public players,
review join requests, and cancel active matches. Players can respond to
invitations at `/mysql/invites`; `/mysql/my-matches` lists matches they
organize or participate in.

The primary-route switch and Auth.js navigation are implemented as an
opt-in preview and have been smoke-tested locally; Supabase remains the
default. The migration is not ready for application cutover. Remaining gates
include configuring and verifying storage for new avatars and match evidence,
verifying SMTP delivery, migrating any remaining required domain workflows
(including tournament pairing or cancellation review if required), and
running full end-to-end parity checks before explicit cutover approval. R2
and SMTP configuration are not present in the local environment, so live
service checks remain blocked. Supabase and its Storage remain unchanged as
the fallback.

## Phase 4: local readiness verification

The configured local MySQL server reports version 8.4.9. The MySQL
configuration tests, transactional workflow integration tests, offline R2
signing/scope tests, TypeScript typecheck, and production build pass. The
workflow integration test rolls back its fixture rows. The R2 test verifies
signing and key scope only; it does not perform a browser upload or download.

The existing `npm run test:e2e` script targets Supabase, creates temporary
Supabase Auth and application rows, and deletes them during cleanup. It was not
run so this fresh-start migration leaves the Supabase project and its data
untouched. This local verification does not substitute for Auth.js browser
testing, SMTP delivery, or live R2/CORS verification. Keep the primary backend
on Supabase until those external checks, any required domain parity work, and
explicit cutover approval are complete.

## Phase 5: Auth.js local end-to-end check

Using a local preview with the opt-in MySQL route switch, browser verification
passed for MySQL registration, automatic session creation, session identity,
Credentials login, primary `/dashboard` routing to the MySQL dashboard, logout,
and rejection of a protected dashboard request after logout. The isolated test
account and its profile/rating rows were removed after the check. The preview
server was stopped. This verifies the local Auth.js/MySQL path only; it does
not verify production origins, deployment cookies, SMTP, R2, or Supabase.

## Phase 6: email and storage integration readiness

The local configuration check confirms that the required R2 and SMTP settings
are absent; their values were not read or displayed. `npm run test:mysql-email`
uses a mocked SMTP client and verifies required settings, paired credentials,
STARTTLS on the default port, implicit TLS on port 465, reset-link formatting,
and connection cleanup on delivery errors. It performs no network delivery.
`npm run test:r2-storage` passes with synthetic test credentials and verifies
signed URL lifetimes, object-key scope, and image upload limits; it does not
contact Cloudflare or verify bucket CORS. Live email delivery and browser
upload/download therefore remain blocked until the corresponding services
are configured in the secret store and tested against their intended origins.
