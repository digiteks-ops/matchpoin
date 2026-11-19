# MATCHPOIN — Refactor Progress

Branch: `refactor/supabase-lean` (never commit this work to `main` directly)
Base tag: `pre-refactor`

| Phase | Status | Evidence / next step |
| --- | --- | --- |
| 0 — Discovery | DONE | Stack mapped, `docs/FEATURES.md`, baseline lint/typecheck/build recorded |
| 1 — Audit | DONE | `docs/AUDIT.md`; critical items fixed (MySQL runtime deps, auth path drift, middleware) |
| 2 — Cleanup | PARTIAL | Legacy MySQL modules retained for rollback; `/mysql/*` pages redirect to Supabase screens; `/api/mysql/*` are aliases. Deletion of dormant modules deferred until production sign-off |
| 3 — Supabase migration | PARTIAL | `supabase/migrations/00013_restore_supabase_architecture.sql`, Supabase services, `scripts/supabase/*`. Migration must still be applied to the live project + data import run |
| 4 — Verify features | PARTIAL | typecheck, lint, build, unit tests green. Live RLS/auth/e2e verification requires deployed Supabase credentials |
| 5 — GitHub | PARTIAL | Branch + commits local. Push/PR pending credentials |
| 6 — Vercel | NOT STARTED | Requires Vercel project + env vars |
| 7 — Final report | NOT STARTED | After deploy |

## Next step

1. Apply `supabase/migrations/00013_restore_supabase_architecture.sql` to the Supabase project.
2. Run `npm run db:backup:mysql` then `npm run db:restore-mysql` (backup → import → validate) with MySQL + Supabase env set.
3. Push `refactor/supabase-lean`, open PR, deploy preview on Vercel, smoke-test auth/RLS.
