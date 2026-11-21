# 00 — CONTEXT (paste first in every session)

```
Repo: D:\idea-to-code\matchpoin-v1 · branch refactor/supabase-lean
Stack: Next.js 14 App Router + TS + Supabase + Vercel.
Baca: docs/HANDOFF.md, docs/PROGRESS.md, docs/FINAL_REPORT.md, docs/SETUP-CHECKLIST.md.

Aturan: migrasi idempotent di supabase/migrations/, UI Bahasa Indonesia, tanpa secret di kode,
jangan hapus fitur, 1 commit per fix, jangan ulang Phase 0-4, jangan refactor di luar tugas.

Status kode: 17 suite + unit 18 PASS; build 55/55.
Akun uji (SUDAH BENAR, tidak perlu cek password):
- player: aabdiar@gmail.com
- player2: rizky.tennis@makassar.id
- admin: matchpoin.id@gmail.com (role=admin, password valid)
Nama tampilan: Andi Abdiar Wahab / Rizky Tennis.

Sudah diterapkan: migrasi 00023_notifications_message.sql (diverifikasi; db:time notifications OK).
Rotasi service key DITOLAK user — risiko diterima, key tidak pernah masuk repo, jangan minta lagi.

E2E: playwright.config.ts sudah punya webServer (auto-start dev saat baseURL localhost).
Kegagalan terakhir (13 FAIL) = ERR_CONNECTION_REFUSED karena server mati, BUKAN bug kode.
Dengan server hidup: 11 pass, hanya tests/e2e/profile.spec.ts merah.

Penting: bedakan kegagalan ENV (server/key/akun) dari bug KODE. Jangan klaim PASS tanpa bukti.
Model guidance: Plan=reasoning tinggi; Implement=coding kuat variant high; Verify=keluarga model berbeda.
```