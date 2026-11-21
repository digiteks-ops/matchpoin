# 02 — VIKEY CODING (implementasi inti)

```
MODE: IMPLEMENT. Baca prompt 00-context. Scope hanya item ini; jangan refactor lain.

TUGAS: root-cause tests/e2e/profile.spec.ts merah.
1) Reproduksi: npx playwright test tests/e2e/profile.spec.ts --reporter=line (webServer auto-start).
2) Bukti wajib: status PUT /api/profile, perubahan DB users.full_name + player_profiles.display_name.
3) Perbaiki akar masalahnya: boleh ubah spec jika tesnya salah, boleh ubah kode jika aplikasinya salah.
   Jangan melemahkan asersi (jangan hapus cek persistensi).
4) Tambah regression test yang sesuai.
5) Jalankan: typecheck, lint, test:unit, lalu profile.spec sekali lagi.

Commit 1x dengan pesan jelas. Akhir: ringkasan 10 baris (root cause, file, test, sisa BLOCKED).
```