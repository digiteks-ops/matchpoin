# 02 — VIKEY CODING (implementasi inti)

```
MODE: IMPLEMENT. Gunakan konteks 00 + docs/HANDOFF.md. Scope hanya profile.spec; jangan refactor lain.

PRASYARAT: di .env.test.local pastikan PLAYWRIGHT_BASE_URL=http://localhost:3000
(bukan Vercel) agar webServer dipakai. Jangan ubah DB/migrasi, jangan buat/hapus akun,
jangan sentuh .env, jangan melemahkan asersi atau menambah skip.

TUGAS: root-cause tests/e2e/profile.spec.ts merah.
1) Reproduksi: npx playwright test tests/e2e/profile.spec.ts --reporter=line (maks 3 percobaan).
2) Bukti wajib: status PUT /api/profile; nilai users.full_name + player_profiles.display_name sebelum/sesudah.
3) Jika tesnya salah → perbaiki spec. Jika aplikasinya salah → perbaiki kode (tanpa migrasi).
4) Jika sudah hijau tanpa perubahan kode: laporkan, JANGAN commit kosong.
5) Regression test bila ada perubahan kode; jalankan typecheck, lint, test:unit, profile.spec.

Commit maksimal 1x dengan pesan jelas. Akhir: ringkasan 10 baris (root cause, file, test, BLOCKED).
```