# MATCHPOIN — Handoff & model prompts

Paste the **context block** first in each model session, then the matching prompt.
Use model guidance per role; a provider name does not imply a capability tier.

## Context block (corrected)

```
Repo: D:\idea-to-code\matchpoin-v1 · branch refactor/supabase-lean
Stack: Next.js 14 App Router + TS + Supabase + Vercel.
Baca: docs/PROGRESS.md, docs/FINAL_REPORT.md, docs/SETUP-CHECKLIST.md.
Aturan: migrasi idempotent, UI Bahasa Indonesia, tanpa secret, jangan hapus fitur, 1 commit per fix, jangan ulang Phase 0-4.
Status kode: 17 suite + unit 18 PASS; build 55/55.
Akun uji: player=aabdiar@gmail.com · player2=rizky.tennis@makassar.id (SUDAH ADA) · admin=matchpoin.id@gmail.com (role=admin).
E2E terakhir: 13 FAIL = ERR_CONNECTION_REFUSED (server mati, BUKAN bug), 2 skip, 5 pass. Dengan server hidup: 11 pass, hanya profile.spec merah.
Pending: migrasi 00023_notifications_message.sql belum dijalankan; TEST_ADMIN_PASSWORD belum diverifikasi.
Penting: sebelum Playwright nyalakan app (http://localhost:3000) atau pakai webServer; pisahkan kegagalan ENV dari bug KODE.
Model guidance: Plan=reasoning tinggi; Implement=coding kuat variant high; Verify=keluarga model berbeda dari Implement.
```

## Prompt A — Plan (read-only)
```
MODE: PLAN ONLY, no file changes.
Audit finalisasi. Jalankan typecheck, lint, test:unit, audit:rls. Cek playwright.config.ts belum punya webServer.
Output tabel P0/P1/P2: masalah, file:line, dampak, fix, test, risiko. Wajib mencakup: (1) webServer Playwright, (2) root-cause profile.spec, (3) notifications message/body, (4) langkah manual user. Maks 100 baris.
```

## Prompt B — Implement
```
MODE: IMPLEMENT. Urut, stop jika konteks habis.
0) playwright.config.ts: webServer hanya saat baseURL localhost (command npm run dev -p <port>, reuseExistingServer, timeout 120s).
1) npx playwright test --reporter=line; ERR_CONNECTION_REFUSED = konfigurasi, bukan tes.
2) Root-cause profile.spec (PUT /api/profile 200+DB terbukti); perbaiki spec/kode + bukti.
3) GET /api/notifications tidak boleh 500 bila kolom message belum ada; fallback body; migrasi 00023 tetap.
Setiap fix: regression test + commit sendiri. Akhir: typecheck, lint, test:unit, build; ringkas 10 baris.
```

## Prompt C — Verify/finalize
```
MODE: VERIFY. Jangan refactor/tambah fitur.
1) Nyalakan app (atau webServer), jalankan npm run verify:live dan npx playwright test --reporter=line. Pisahkan ENV vs KODE.
2) audit:rls; minta user jalankan 00023 dan verifikasi 00022/00023 via SQL read-only.
3) Perbaiki HANYA bug blocking; 1 commit + regression test.
4) Update docs/FINAL_REPORT.md & SETUP-CHECKLIST.md.
Akhir: tabel PASS/FAIL/BLOCKED, commit list, 5 langkah manual tersisa.
```

## Manual prerequisites (cannot be automated)
1. SQL Editor: run `supabase/migrations/00023_notifications_message.sql`.
2. `.env.test.local`: verify `TEST_ADMIN_PASSWORD` and `TEST_PLAYER2_PASSWORD`.
3. Rotate the exposed service-role key; update `.env.local`, `.env.test.local`, Vercel.
4. Merge PR / redeploy Vercel with final env vars.