# MATCHPOIN — ALL STAGED PROMPTS (00 → 04)

Urutan: tempel 00 dulu, lalu 01 (opsional), 02, 03, 04 di sesi model masing-masing.

---

# 00 â€” CONTEXT (paste first in every session)

```
Repo: D:\idea-to-code\matchpoin-v1 Â· branch refactor/supabase-lean
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
Rotasi service key DITOLAK user â€” risiko diterima, key tidak pernah masuk repo, jangan minta lagi.

E2E: playwright.config.ts sudah punya webServer (auto-start dev saat baseURL localhost).
Kegagalan terakhir (13 FAIL) = ERR_CONNECTION_REFUSED karena server mati, BUKAN bug kode.
Dengan server hidup sebelumnya: 11 pass; sisa merah hanya tests/e2e/profile.spec.ts.
Jangan jalankan perintah destruktif (hapus .next/node_modules) tanpa izin user.

Penting: bedakan kegagalan ENV (server/key/akun) dari bug KODE. Jangan klaim PASS tanpa bukti.
Model guidance: Plan=reasoning tinggi; Implement=coding kuat variant high; Verify=keluarga model berbeda.
```

---

# 01 â€” VIKEY PLAN (read-only audit)

```
MODE: PLAN ONLY. Tidak boleh edit file, tidak boleh commit, JANGAN jalankan Playwright (mahal).

Gunakan konteks 00 yang sudah ditempel + baca docs/HANDOFF.md. Lalu:
1) Jalankan: npm run typecheck, npm run lint, npm run test:unit, npm run audit:rls.
2) Inspeksi (baca saja) playwright.config.ts dan tests/e2e/profile.spec.ts.
3) Audit sisa pekerjaan menuju rilis: profile.spec, stabilitas E2E, kesiapan deploy,
   keamanan RLS, dan langkah manual user.
4) Jangan minta rotasi service key (sudah ditolak user).

Output (maks 100 baris, tanpa narasi):
Tabel prioritas P0/P1/P2: masalah | file:line | dampak | fix | test yang harus ditambah | risiko.
Akhir: daftar 5 langkah manual user (urut).
```

---

# 02 â€” VIKEY CODING (implementasi inti)

```
MODE: IMPLEMENT. Gunakan konteks 00 + docs/HANDOFF.md. Scope hanya profile.spec; jangan refactor lain.

PRASYARAT: di .env.test.local pastikan PLAYWRIGHT_BASE_URL=http://localhost:3000
(bukan Vercel) agar webServer dipakai. Jangan ubah DB/migrasi, jangan buat/hapus akun,
jangan sentuh .env, jangan melemahkan asersi atau menambah skip.

TUGAS: root-cause tests/e2e/profile.spec.ts merah.
1) Reproduksi: npx playwright test tests/e2e/profile.spec.ts --reporter=line (maks 3 percobaan).
2) Bukti wajib: status PUT /api/profile; nilai users.full_name + player_profiles.display_name sebelum/sesudah.
3) Jika tesnya salah â†’ perbaiki spec. Jika aplikasinya salah â†’ perbaiki kode (tanpa migrasi).
4) Jika sudah hijau tanpa perubahan kode: laporkan, JANGAN commit kosong.
5) Regression test bila ada perubahan kode; jalankan typecheck, lint, test:unit, profile.spec.

Commit maksimal 1x dengan pesan jelas. Akhir: ringkasan 10 baris (root cause, file, test, BLOCKED).
```

---

# 03 â€” VIKEY MOCIN (stabilisasi E2E)

```
MODE: IMPLEMENT SPESIFIKASI TES SAJA. Jangan ubah fitur aplikasi.
Baca prompt 00-context. Akun uji sudah valid; jangan skip karena akun/password.

1) Jalankan seluruh suite: npx playwright test --reporter=line (webServer auto-start).
2) Klasifikasikan setiap FAIL: ENV (server/key/data), SPEC (selector/wait), atau KODE (bug aplikasi).
3) Perbaiki hanya SPEC: selector stabil (id/role), waitForURL/waitForResponse, hilangkan race.
4) Jangan menambah skip kecuali benar-benar tidak dapat diuji; sebutkan alasannya.
5) Jalankan ulang sampai semua PASS atau skip beralasan. typecheck + lint tetap hijau.

Commit 1x (hanya tests/e2e + playwright config bila perlu).
Akhir: tabel hasil (test | status | alasan) + daftar bug KODE yang tersisa (jika ada).
```

---

# 04 â€” VIKEY AGENT GPT (verifikasi & finalisasi)

```
MODE: VERIFY / FINALIZE. Jangan tambah fitur, jangan refactor. Hanya perbaiki bug blocking.
Baca prompt 00-context. Gunakan keluarga model berbeda dari tahap implementasi.

1) Jalankan berurutan dan catat hasil apa adanya:
   - npm run verify:live
   - npx playwright test --reporter=line
   - npm run audit:rls
   - npm run build
2) Pisahkan FAIL ENV (server/key/data) dari FAIL KODE. Jangan mengklaim PASS tanpa bukti.
3) Jika ada bug blocking runtime/deploy: perbaiki minimal + regression test, 1 commit per fix.
4) Update docs/FINAL_REPORT.md dan docs/SETUP-CHECKLIST.md dengan status terakhir.

Output akhir:
- Tabel PASS/FAIL/BLOCKED (per cek)
- Commit list
- 5 langkah manual tersisa untuk user
- Pernyataan eksplisit: siap rilis atau belum, beserta alasannya
```

---

