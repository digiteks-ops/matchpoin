# Bootstrap Super Admin pertama

Prosedur satu kali untuk menetapkan Super Admin pertama. Tidak ada endpoint HTTP
dan tidak ada akun yang dibuat oleh prosedur ini.

## Prasyarat

1. Migrasi `0010_rbac_foundation.sql` sudah diterapkan (`npm run db:migrate`).
2. Migrasi `0011_rbac_security_state.sql` sudah diterapkan. Tabel ini menyediakan
   lock global RBAC; tanpa tabel ini semua perubahan role istimewa ditolak
   (fail-closed).
3. User target sudah terdaftar di tabel `users` (registrasi MySQL biasa).
4. Backup database sudah dibuat.

## Langkah

1. Buat nilai acak yang panjang (contoh: hasil password manager, minimal 32 karakter).
2. Tambahkan ke `.env.local` hanya untuk sesi ini:

   ```
   MATCHPOIN_BOOTSTRAP_SECRET=<nilai-acak>
   ```

3. Jalankan dari terminal server (bukan dari browser):

   ```
   npm run db:bootstrap-super-admin -- --email=operator@example.com --confirm
   ```

   atau memakai UUID:

   ```
   npm run db:bootstrap-super-admin -- --user-id=<uuid> --confirm
   ```

4. Saat diminta, ketik ulang secret yang sama.

## Perilaku keamanan

- Memperoleh lock global `rbac_security_state` (`SELECT ... FOR UPDATE`) sebelum
  memeriksa apakah Super Admin sudah ada, sehingga dua bootstrap bersamaan tidak
  dapat sama-sama berhasil.
- Ditolak jika sudah ada Super Admin aktif.
- Ditolak jika `MATCHPOIN_BOOTSTRAP_SECRET` kosong.
- Ditolak tanpa flag `--confirm`.
- Ditolak jika secret yang diketik tidak cocok.
- Ditolak jika user target tidak ada.
- Role dan audit ditulis dalam satu transaksi; jika audit gagal, role dibatalkan.
- Audit menyimpan alasan `Initial operator bootstrap`.

## Setelah selesai

Hapus `MATCHPOIN_BOOTSTRAP_SECRET` dari `.env.local`. Jangan menyimpannya di
environment produksi. Jangan mengulang prosedur ini; perubahan role berikutnya
dilakukan oleh Super Admin melalui `POST /api/mysql/admin/roles`.

## Rollback RBAC

File `mysql/rollbacks/0010_rbac_foundation_rollback.sql` hanya menghapus tabel
RBAC (`role_audit_logs`, `user_roles`, `roles`). File ini tidak menyentuh tabel
`users` atau data pemain, dan tidak dijalankan oleh migration runner.
