# MySQL migration plan

## Current boundary

The application continues to use Supabase for its database, authentication,
and file storage. The MySQL driver, connection check, and migration runner are
foundation tooling only; they do not redirect application traffic or migrate
data. Do not apply a production migration or remove Supabase before explicit
cutover approval.

The selected database driver is `mysql2`, using prepared statements for
application queries. There is no existing ORM to preserve, so this phase does
not add one or port data-access services prematurely.

## Prerequisite phase before Phase 3: app-wide migration

Phase 3 must remain blocked until this prerequisite is complete and verified.
The current app has Supabase Auth and RLS assumptions across login, profile,
player, match, league, tournament, and API routes; replacing authentication in
only the match workflow would break existing features.

1. Configure direct source/target database URLs locally. Take a complete source
   database backup and a separate backup of Storage object bytes. Restore the
   database archive into an isolated PostgreSQL instance and verify it before
   migration.
2. Inventory the deployed schema and migration state read-only. Compare it with
   the application queries and the initial schema mapping below; do not infer
   production schema from stale checked-in migrations.
3. Create and review the MySQL schema and a repeatable, non-destructive import
   for account identities, profiles, ratings, match history, rankings, and all
   related records. Keep stable IDs and retain rejected/unmapped rows for
   investigation.
4. Implement Auth.js email/password authentication using MySQL-backed user
   records and signed JWT sessions. Keep the existing login usable until the
   backfill is ready; migrate hashes only after format verification, otherwise
   require a secure password reset without replacing account IDs.
5. Replace Supabase Auth/RLS checks throughout pages and routes with
   server-side authentication and authorization. Move reads and writes to
   parameterized MySQL services and migrate file access to the selected
   non-Supabase storage provider.
6. Run login, registration, session, permission, and feature-parity checks
   against a staging database and restored data. Verify backups, row counts,
   relationships, match history, ratings, and assets before explicit cutover.

Do not delete or disable the source database or storage during this work. Do
not start Phase 3 until all migration checks pass and cutover is approved.

## Initial schema mapping

Keep stable user and record identifiers during import. A first-pass MySQL
mapping should cover:

| Existing data | MySQL target |
| --- | --- |
| Supabase Auth users and `public.users` | A single account identity model plus profile attributes; choose the authentication provider before implementing account migration. |
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

This mapping is logical, not a claim that the checked-in Supabase migrations
represent the live database. Compare it with a read-only inventory of the
deployed schema and migration history before writing import SQL.

## Authentication and storage decisions

The selected identity system is Auth.js with MySQL-backed users and a signed
JWT session strategy, as required for the email/password Credentials provider.
Active Auth.js sessions will not be database rows; use short, bounded session
lifetimes and rotate the Auth.js secret when required. Preserve stable user IDs
where possible. Attempt verified password-hash migration only if the source
hash format can be validated; otherwise require a secure password-reset flow.
Do not copy tokens or service-role secrets into MySQL or client bundles.

Select an object-storage provider before moving assets. Inventory avatar and
match-evidence objects separately, preserve ownership metadata, and use
private/signed access for match evidence. Verify object counts, access policy,
and URL replacement before switching reads.

## Migration and rollback procedure

1. Back up the complete source database and storage; record table counts and
   key constraints. The Supabase database backup command requires
   `SUPABASE_DB_URL`, `MATCHPOIN_BACKUP_DIR`, `pg_dump`, and `pg_restore`.
   Validate the archive and perform a restore drill before relying on it. Keep
   the source online and unchanged.
2. Create and test versioned, additive MySQL migrations on a non-production
   database. Review every SQL file before running `npm run db:migrate`.
3. Import a consistent source snapshot using stable IDs, parameterized writes,
   foreign-key checks, and repeatable batches. Record rejects rather than
   silently dropping rows.
4. Compare row counts, relationships, ratings, match outcomes, standings, and
   storage objects. Run workflow and authorization tests against MySQL.
5. Plan a write freeze or another explicitly approved consistency mechanism
   before final synchronization. Verify backups and rollback steps before any
   production cutover.
6. Switch traffic only with explicit approval. Keep the old source read-only
   and recoverable until post-cutover verification is complete.

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

No application tables are migrated by the current foundation. `SUPABASE_DB_URL`
and `DATABASE_URL` are not currently configured locally, and PostgreSQL backup
tools are unavailable. Therefore no backup, live connectivity check, DDL, or
data import has been performed.
