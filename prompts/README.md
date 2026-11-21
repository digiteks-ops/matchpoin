# MATCHPOIN — Staged prompts

Urutan pakai: **00 → 01 (opsional) → 02 → 03 → 04**.
Setiap sesi model baru: tempel `00-context.md` dulu, baru file tahapnya.

| File | Model | Peran | Boleh edit? |
| --- | --- | --- | --- |
| `00-context.md` | semua | konteks & status | tidak |
| `01-vikeyplan.md` | vikey plan | audit rencana P0/P1/P2 | tidak |
| `02-vikeycoding.md` | vikey coding / agent-coding | implementasi bug inti (profile.spec) | ya |
| `03-vikeymocin.md` | vikey mocin | stabilisasi spesifikasi E2E | ya (tests/e2e) |
| `04-vikeyagentgpt.md` | vikey agent gpt | verifikasi rilis & finalisasi | ya (hanya blocking) |

## Pilihan sesuai kebutuhan
- Hanya ingin sisa masalah → `00` + `01`
- Perbaiki bug profil → `00` + `02`
- Semua E2E hijau → `00` + `03` (setelah `02`)
- Siap rilis → `00` + `04`

## Model guidance
- Plan: reasoning tinggi (analisis, tanpa edit).
- Implement: model coding kuat, variant high.
- Verify: pakai keluarga model berbeda dari implement agar blind spot terdeteksi.
- Jangan asumsikan nama provider = kualitas; pilih model+varian sesuai peran.

## Prasyarat manual
1. `TEST_PLAYER2_PASSWORD` di `.env.test.local` (akun existing).
2. Merge PR + env Vercel + redeploy sebelum `04` dijalankan pada produksi.
3. Rotasi service key: ditolak user (risiko diterima). Jangan minta lagi.

## Definition of done
- `typecheck`, `lint`, `test:unit`, `build` hijau.
- `npx playwright test` lulus atau skip beralasan.
- `npm run verify:live` tanpa FAIL (BLOCKED boleh, dengan alasan).
- `docs/FINAL_REPORT.md` & `docs/SETUP-CHECKLIST.md` diperbarui.