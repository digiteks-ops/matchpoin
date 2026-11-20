# MATCHPOIN — Refactor Progress

Branch: `refactor/supabase-lean` (never commit this work to `main` directly)
Base tag: `pre-refactor`

| Phase | Status | Evidence / next step |
| --- | --- | --- |
| 0 — Discovery | DONE | Stack mapped, `docs/FEATURES.md`, baseline lint/typecheck/build recorded |
| 1 — Audit | DONE | `docs/AUDIT.md`; critical items fixed (MySQL runtime deps, auth path drift, middleware) |
| 2 — Cleanup | PARTIAL | Legacy MySQL modules retained for rollback; `/mysql/*` pages redirect to Supabase screens; `/api/mysql/*` are aliases. Deletion of dormant modules deferred until production sign-off |
| 3 — Supabase migration | DONE | Migrations 00009–00019 applied (00015 chat RLS, 00016 registration write path, 00017 admin role/RLS, 00018 OAuth trigger, 00019 storage); admin seed run (5 IKA17 categories, quota 24) |
| 4 — Verify features | PARTIAL | typecheck, lint, build, unit/migration tests green. Live provider (Google/Facebook) and storage upload checks are manual |
| 5 — GitHub | PARTIAL | `refactor/supabase-lean` pushed to origin. PR merge to `main` pending |
| 6 — Vercel | PARTIAL | Production deploy requires merge/Production Branch switch + env vars (`SUPABASE_SERVICE_ROLE_KEY`, Supabase URL/anon key, `NEXT_PUBLIC_APP_URL`) |
| 7 — Final report | NOT STARTED | After production deploy verification |

## Liga Tennis IKA17 + match fix (2026-11-19)

- Match creation failed because live `matches.court_id` was still `NOT NULL` while manual courts are stored in `metadata`; `supabase/migrations/00014_match_and_league_ika17.sql` drops the constraint. The service now uses the shared roster builder for singles/doubles and marks private matches correctly.
- `00014` also adds the league columns, pending/accepted/rejected registration model, RBAC functions, and registration/approval RPCs used by `/tournaments`, `/admin/tournaments`, and `/admin/tournaments/[id]`.
- `npm run db:seed-admin` creates/updates the admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and seeds the 5 IKA17 categories (quota 24).
- Verification: `npm run typecheck`, `npm run lint`, roster/registration/RBAC/logout tests, and `npm run build` pass. Live Supabase verification still requires applying `00014` and running the seed.

## Phase 2 Part A/B (2026-11-20)

- **Chat RLS recursion** — `00015_fix_chat_rls_recursion.sql` replaces self-referencing `conversation_members` policies with `public.is_conversation_member()` (SECURITY DEFINER). Test: `npm run test:supabase-chat`.
- **Tournament registration** — `00016_fix_registration_write_path.sql` relaxes audit constraints (`submitted`, nullable `previous_status`, `accepted`) and adds approval columns. UI keeps loading/disabled/duplicate guards and shows "Menunggu Persetujuan". Test: `npm run test:supabase-registration`.
- **Open singles** — roster builder accepts `matchType=open` for singles; API/service only require an opponent for private singles; form has "Pilih Lawan"/"Open Match"; empty slot shows "Terbuka" + Gabung; host notified on join. `join_match` keeps row lock/duplicate/capacity guards. Tests: `test:mysql-roster`, `test:supabase-open-match`.
- **Host name on cards** — one batched `public_players` lookup (plus fallback) resolves organizer name/avatar; fallback "Pemain". Test: `test:supabase-match-card`.
- **/auth/login** — `/auth/login` redirects to `/login`; auth error boundary + Indonesian query-error mapping. Test: `test:supabase-auth-login`.
- **Admin dashboard** — `00017_admin_role_and_registration_rls.sql` adds `role` with a self-escalation trigger, `public.is_admin()` overloads, own-registration RLS, aggregate quota RPC, filtered/bulk admin list, optional decline reason. Admin area has its own layout/guard; admins are routed from `/dashboard` to `/admin` and lose player nav. Test: `test:supabase-admin`.
- **Google/Facebook OAuth** — `00018_oauth_profiles_trigger.sql` fills `profiles` from provider metadata; callback handles denied consent, missing code, exchange failure, and Facebook without email; branded "Mengalihkan ke …" overlay; README setup guide. Test: `test:supabase-oauth`.
- **Image uploads** — client compression (≤300 KB, WebP, 1280 px / 512 px avatars), JPG/PNG/WEBP validation, 10 MB original cap, buckets `avatars`/`match-results` with owner/participant policies, old avatar deletion, match-photo deletion on remove. Test: `test:supabase-storage`.

## Next step

1. Merge `refactor/supabase-lean` → `main` (or set Vercel Production Branch) and redeploy.
2. Verify production env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEFAULT_TIMEZONE`.
3. Smoke-test on production: Google/Facebook login (new + cancel), avatar upload, match-result upload, player registration → admin approve, admin `/admin` guard, non-admin 403 on approve/reject.
4. Only after sign-off: optional Phase 2 cleanup (remove dormant MySQL modules) and the MySQL→Supabase data import.

