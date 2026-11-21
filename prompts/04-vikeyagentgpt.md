# 04 — VIKEY AGENT GPT (verifikasi & finalisasi)

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