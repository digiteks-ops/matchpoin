# 03 — VIKEY MOCIN (stabilisasi E2E)

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