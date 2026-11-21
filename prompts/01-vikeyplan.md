# 01 — VIKEY PLAN (read-only audit)

```
MODE: PLAN ONLY. Tidak boleh edit file, tidak boleh commit.

Baca prompt 00-context. Lalu:
1) Jalankan: npm run typecheck, npm run lint, npm run test:unit, npm run audit:rls.
2) Cek playwright.config.ts (webServer sudah ada) dan tests/e2e/profile.spec.ts.
3) Audit sisa pekerjaan menuju rilis: profile.spec, stabilitas E2E, kesiapan deploy,
   keamanan RLS, dan langkah manual user.

Output (maks 100 baris, tanpa narasi):
Tabel prioritas P0/P1/P2: masalah | file:line | dampak | fix | test yang harus ditambah | risiko.
Akhir: daftar 5 langkah manual user (urut).
```