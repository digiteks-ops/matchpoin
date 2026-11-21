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
Akun uji: player=aabdiar@gmail.com · player2=rizky.tennis@makassar.id (SUDAH ADA) · admin=matchpoin.id@gmail.com (role=admin, password terverifikasi).
Sudah diterapkan: migrasi 00023_notifications_message.sql (diverifikasi lewat db:time).
E2E terakhir: 13 FAIL = ERR_CONNECTION_REFUSED (server mati, BUKAN bug), 2 skip, 5 pass. Dengan server hidup: 11 pass, hanya profile.spec merah.
Pending: tidak ada cek password akun; ketiga akun sudah benar. Rotasi service key DITOLAK user (risiko diterima; key tidak pernah masuk repo).
Template prompt per model ada di `prompts/`.
Penting: sebelum Playwright nyalakan app (atau andalkan webServer); pisahkan kegagalan ENV dari bug KODE.
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
MODE: IMPLEMENT. Baca docs/HANDOFF.md.
Root-cause profile.spec: reproduksi via npx playwright test tests/e2e/profile.spec.ts --reporter=line (webServer otomatis). Bukti PUT /api/profile + DB. Perbaiki spec ATAU kode; 1 commit + regression test.
Jangan sentuh notifikasi (00023 sudah diverifikasi).
Akhir: typecheck, lint, test:unit, build. Ringkas 10 baris.
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

## Manual prerequisites
1. Service key: rotation declined by the user; risk accepted, key never committed. Do not ask again.
2. Merge PR / redeploy Vercel with final env vars.