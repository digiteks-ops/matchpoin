# MATCHPOIN — Setup & Live Verification Checklist

Ordered steps to take the branch from "code done" to "verified in production".
Run every command from the repository root on `refactor/supabase-lean`.

---

## 1. Fix local environment keys
Supabase Dashboard → project → **Settings → API**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` (**base URL only**, e.g. `https://xxxx.supabase.co`; do **not** append `/rest/v1`)
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY` (server only)

Put them in `.env.local` (never commit). Verify:

```powershell
npm run db:time
```

Expected: six timing lines, no `Unregistered API key`.

## 2. Apply remaining migrations (SQL Editor)
Run each file top-to-bottom in the Supabase **SQL Editor**, in this order:

1. `supabase/migrations/00019_storage_buckets_and_policies.sql` (updated, re-runnable)
2. `supabase/migrations/00020_query_explain_tool.sql`
3. `supabase/migrations/00021_perf_indexes_and_rls.sql`
4. `supabase/migrations/00022_rls_hardening.sql`

Verify:

```sql
-- every public table has RLS on
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- no duplicate storage policies
SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
-- reject RPC keeps the optional reason
SELECT proname, proargdefaults IS NOT NULL AS has_defaults FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname='admin_reject_registration';
```

## 3. Create test accounts and the admin
1. Register two players at `/register` (e.g. `e2e-player@…`, `e2e-player2@…`).
2. Register the admin account (or reuse `matchpoin.id@gmail.com`).
3. Promote it in SQL Editor (runs as postgres, allowed by the role trigger):

```sql
UPDATE public.users SET role='admin' WHERE email='your-admin@example.com';
SELECT email, role FROM public.users WHERE email='your-admin@example.com';
```

## 4. Configure Playwright tests
```powershell
Copy-Item .env.test.local.example .env.test.local
# fill PLAYWRIGHT_BASE_URL, Supabase keys and TEST_* accounts
npm i -D @playwright/test
npx playwright install chromium
npm run test:e2e:playwright
```

Without `@playwright/test` installed the specs still live in `tests/e2e/` and
auto-skip with a `BLOCKED:` message; `tsc` excludes that folder until you install it.

## 5. Run the orchestrator
```powershell
npm run verify:live
```

Prints a PASS / FAIL / BLOCKED table for env, migrations, RLS smoke, timings,
Playwright and Lighthouse. Exit code is non-zero when something is FAIL.

## 6. Merge and deploy
1. Open a PR: `https://github.com/digiteks-ops/matchpoin/pull/new/refactor/supabase-lean` → Merge.
   Or set Vercel → **Settings → Git → Production Branch** to `refactor/supabase-lean`.
2. Vercel → **Settings → Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL=https://matchpoin.vercel.app`
   - `NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Makassar`
   - `NEXT_PUBLIC_SUPABASE_STORAGE_RESULTS_BUCKET=match-results`
3. **Redeploy** and confirm the build is **Ready** with no runtime errors in
   Vercel → Deployments → Functions → Logs.

## 7. Lighthouse (mobile)
```powershell
npm i -D lighthouse
$env:LIGHTHOUSE_BASE_URL="https://matchpoin.vercel.app"; npm run verify:live
```
Or install the Chrome Lighthouse extension and audit `/`, `/login`,
`/tournaments`, `/matches`, `/admin` with the mobile preset.

---

## Google / Facebook login — 5 manual steps (cannot be automated)
1. Supabase → Authentication → Providers → Google/Facebook: paste Client ID/Secret.
2. Google Cloud Console → OAuth Client (Web): redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; origins `http://localhost:3000`, `https://matchpoin.vercel.app`.
3. Meta for Developers → Facebook Login: same callback as Valid OAuth Redirect URI; App Domains `<project-ref>.supabase.co` + `matchpoin.vercel.app`; Privacy Policy URL `https://matchpoin.vercel.app/privacy`; Data Deletion URL `https://matchpoin.vercel.app/privacy#hapus-data`; switch app to Live.
4. Supabase → Authentication → URL Configuration: Site URL `https://matchpoin.vercel.app`; redirect URLs `https://matchpoin.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`.
5. Test on production: Google new account, Facebook new account, cancel consent (must show the Indonesian message), Facebook without email (must be asked to use Google/email).

## Mobile checklist
- Upload a profile photo straight from the camera (iPhone + Android); confirm compression to ≤300 KB and that the old photo disappears from Storage.
- Upload match-result photos from cellular data; confirm the progress text and that a non-participant cannot upload.
- Navigation on 3G: home → matches → detail → join keeps the skeleton visible and does not blank the page.
- `/admin` tables scroll horizontally on a phone; Accept/Decline and bulk actions reachable.
