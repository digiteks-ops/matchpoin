# Tutorial Detail: Login Google + Lupa Password (Supabase Auth)

Panduan langkah demi langkah, dari nol sampai tombol **"Masuk dengan Google"**
dan tautan **lupa password** benar-benar berfungsi di produksi.

> **Login Facebook sudah dihapus** dari aplikasi. Tombolnya tidak ada lagi di
> `/login` dan `/register`, dan provider Facebook di Supabase sebaiknya
> dibiarkan **nonaktif**. Alasan: banyak akun Facebook tidak membagikan email
> sehingga proses daftar/masuk gagal di tengah jalan.

---

## 0. Data proyek (pakai ini, jangan dikarang)

| Item | Nilai |
| --- | --- |
| Project ref Supabase | `flbiltsyobllkxydyufq` |
| URL Supabase | `https://flbiltsyobllkxydyufq.supabase.co` |
| Callback Supabase (untuk Google) | `https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback` |
| Domain produksi | `https://matchpoin.vercel.app` |
| Domain lokal | `http://localhost:3000` |
| Callback aplikasi | `https://matchpoin.vercel.app/auth/callback` |
| Halaman ganti password | `https://matchpoin.vercel.app/reset-password` |

Alur yang terjadi di balik layar (supaya tidak bingung saat ada error):

```
Pengguna klik "Masuk dengan Google"
        │
        ▼
Supabase Auth  ──redirect──▶  accounts.google.com  (pilih akun, setujui izin)
        ▲                              │
        │                              │ redirect ke:
        │                              │ https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback
        │                              ▼
        └──────────────────  Supabase menukar code → session
                                       │
                                       │ redirect ke (harus terdaftar di Redirect URLs):
                                       ▼
                    https://matchpoin.vercel.app/auth/callback?code=...
                                       │
                                       ▼
              Aplikasi tukar code → session → /dashboard
```

Jadi ada **dua** alamat callback yang berbeda dan sering tertukar:

| Alamat | Didaftarkan di mana | Isinya |
| --- | --- | --- |
| `https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback` | Google Cloud Console | milik Supabase |
| `https://matchpoin.vercel.app/auth/callback` | Supabase → URL Configuration | milik aplikasi MATCHPOIN |

---

## BAGIAN 1 — URL Configuration (kerjakan paling awal)

Ini yang membuat tautan reset password tidak nyasar ke `localhost` dan
membuat callback OAuth diterima.

### Langkah 1.1 — Buka halaman pengaturan
1. Buka <https://supabase.com/dashboard>.
2. Login dengan akun Supabase Anda.
3. Klik project **matchpoin** (ref `flbiltsyobllkxydyufq`).
4. Di menu kiri, klik **Authentication** (ikon gembok/orang).
5. Di submenu, klik **URL Configuration**.

### Langkah 1.2 — Isi Site URL
Pada kolom **Site URL**, isi **persis**:

```
https://matchpoin.vercel.app
```

- Tanpa garis miring di akhir.
- Harus `https://`, bukan `http://`.
- **Bukan** `http://localhost:3000`. Kalau diisi localhost, semua email reset
  password akan mengarah ke laptop Anda, bukan ke website.

### Langkah 1.3 — Tambahkan Redirect URLs
Di bagian **Redirect URLs**, klik **Add URL** lalu tempel satu alamat per
baris. Tambahkan **keempat-empatnya**:

```
https://matchpoin.vercel.app/auth/callback
https://matchpoin.vercel.app/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/reset-password
```

Kenapa masing-masing perlu:

| URL | Dipakai untuk |
| --- | --- |
| `.../auth/callback` | Login Google **dan** tautan reset password (aplikasi menukar `code` di sini) |
| `.../reset-password` | Halaman form "Buat Password Baru" setelah email reset diklik |
| `localhost:3000/...` | Hanya untuk uji di komputer sendiri saat `npm run dev` |

Kalau nanti memakai domain sendiri (mis. `https://matchpoin.id`), tambahkan
juga:

```
https://matchpoin.id/auth/callback
https://matchpoin.id/reset-password
```

### Langkah 1.4 — Simpan
Klik tombol **Save** di kanan atas. Tidak ada proses deploy; berlaku langsung.

### Langkah 1.5 — Pastikan tidak ada entri wildcard

Kembali ke daftar **Redirect URLs**. Entri seperti `**`, `https://**`, atau
`https://*` membuat Supabase menerima **domain apa pun** sebagai tujuan
callback.

Cara menguji:

```bash
npm run audit:auth
```

Kalau muncul peringatan **"Redirect URLs terlalu terbuka"**, hapus entri
wildcard dan sisakan empat URL spesifik di Langkah 1.3.

Dampak sebenarnya terbatas — penyerang tidak memiliki `code_verifier` PKCE
korban, jadi `code` tidak bisa ditukar menjadi sesi — tetapi daftar tertutup
jauh lebih mudah diaudit.

### Langkah 1.6 — Uji
1. Buka `https://matchpoin.vercel.app/forgot-password`.
2. Isi email akun Anda → kirim.
3. Buka email → klik tautan.
4. **Hasil yang benar:** terbuka halaman **"Buat Password Baru"** dengan dua
   kolom password.

Kalau yang terbuka malah beranda atau halaman error, lihat tabel
troubleshooting di Bagian 4.

---

## BAGIAN 2 — Provider Google (step by step)

Bagian ini terdiri dari dua tempat: **Google Cloud Console** (membuat
kredensial) dan **Supabase Dashboard** (menempelkan kredensial).

### 2A. Google Cloud Console — buat project

1. Buka <https://console.cloud.google.com> dengan akun Google Anda.
2. Di bar atas, klik dropdown project → **New Project**.
3. Project name: `MATCHPOIN` → **Create**.
4. Tunggu notifikasi "Project created" → pastikan dropdown project di bar atas
   sekarang menunjukkan **MATCHPOIN**.

### 2B. Google Cloud Console — OAuth consent screen

Layar ini yang muncul saat pengguna diminta "setujui izin".

1. Menu kiri → **APIs & Services** → **OAuth consent screen**
   (di UI baru: **Google Auth Platform** → **Branding**).
2. User Type: pilih **External** → **Create**.
3. Isi:
   - **App name**: `MATCHPOIN`
   - **User support email**: email Anda
   - **Developer contact information**: email Anda
   - Logo, homepage, privacy policy: opsional, boleh dikosongkan dulu
4. **Save and Continue**.
5. Tab **Scopes** → **Add or remove scopes** → centang:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`

   → **Update** → **Save and Continue**.
6. Tab **Test users** → **Add users** → masukkan email Google yang akan Anda
   pakai untuk menguji → **Save and Continue**.
7. **Back to Dashboard**.

> **Penting:** selama status aplikasi masih **Testing**, hanya email di daftar
> Test users yang bisa masuk. Pemain lain akan melihat
> *"Access blocked: MATCHPOIN has not completed the Google verification process"*.
> Karena itu langkah 2E di bawah (Publish app) **wajib** dilakukan sebelum
> dirilis ke pemain sungguhan.

### 2C. Google Cloud Console — buat OAuth Client ID

1. Menu kiri → **APIs & Services** → **Credentials**.
2. Klik **+ Create Credentials** → **OAuth client ID**.
3. **Application type**: **Web application**.
4. **Name**: `MATCHPOIN Web`.
5. **Authorized JavaScript origins** → **Add URI**, tambahkan **dua** baris:
   ```
   http://localhost:3000
   https://matchpoin.vercel.app
   ```
   (Tanpa `/` di akhir, tanpa path.)
6. **Authorized redirect URIs** → **Add URI**, tambahkan **satu** baris:
   ```
   https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback
   ```
   Ini **bukan** alamat Vercel. Kalau salah di sini, akan muncul
   `Error 400: redirect_uri_mismatch`.
7. Klik **Create**.
8. Muncul dialog berisi **Client ID** dan **Client Secret**.
   - Klik **Download JSON** (cadangan) **atau** salin dua nilai itu sekarang.
   - **Client Secret hanya ditampilkan sekali.** Kalau hilang, buat client baru
     atau klik **Reset secret**.

Contoh bentuk nilainya (milik Anda akan berbeda):

```
Client ID     : 123456789012-abcdefghijklmnop.apps.googleusercontent.com
Client Secret : GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 2D. Supabase — tempel Client ID + Secret

1. Kembali ke <https://supabase.com/dashboard> → project **matchpoin**.
2. Menu kiri → **Authentication** → **Providers** (di UI baru:
   **Sign In / Providers**).
3. Cari dan klik **Google**.
4. Nyalakan toggle **Enable Sign in with Google**.
5. Tempel:
   - **Client ID (for OAuth)** ← Client ID dari langkah 2C
   - **Client Secret (for OAuth)** ← Client Secret dari langkah 2C
6. Perhatikan kolom **Callback URL (for OAuth)** yang ditampilkan Supabase.
   Nilainya harus **sama persis** dengan redirect URI yang Anda isi di langkah
   2C butir 6. Kalau berbeda, salin nilai dari Supabase ini dan tempel ke
   Google Cloud Console (jangan sebaliknya).
7. Klik **Save**.

Tidak perlu mengisi apa pun di `.env.local` atau Vercel. Secret disimpan di
Supabase, bukan di kode aplikasi.

### 2E. Publikasikan aplikasi Google (agar semua pemain bisa masuk)

1. Google Cloud Console → **APIs & Services** → **OAuth consent screen**.
2. Di bagian **Publishing status**, cek masih **Testing**.
3. Klik **Publish app** → **Confirm**.
4. Status berubah menjadi **In production**.

Selama masih **Testing**, hanya Test users yang bisa masuk — inilah penyebab
paling umum dari *"tombol Google jalan di laptop saya, tapi pemain lain tidak
bisa"*.

### 2F. Uji login Google

1. Buka `https://matchpoin.vercel.app/login`.
2. Klik **Masuk dengan Google**.
3. Muncul overlay "Mengalihkan ke Google..." → halaman pilih akun Google.
4. Pilih akun → setujui izin.
5. **Hasil yang benar:** mendarat di `/dashboard` dan sudah dalam keadaan login.
6. Untuk pengguna baru: diarahkan sekali ke `/pilih-kategori` untuk memilih
   level awal (beginner / intermediate / advanced / expert).
7. Uji juga tombol **Batal**: klik Google → tutup jendela pilih akun →
   harus muncul pesan Indonesia *"Anda membatalkan proses masuk. Silakan coba
   lagi."*, bukan halaman kosong.

### 2G. Matikan Facebook & sign-in anonim (wajib untuk rilis)

Aplikasi hanya memakai Google dan email. Dua hal ini sebaiknya dimatikan agar
tidak ada jalan masuk yang tidak dipakai:

1. Supabase → **Authentication** → **Providers** → **Facebook** → matikan
   toggle → **Save**.
2. Supabase → **Authentication** → **Providers** → **Anonymous sign-ins** →
   matikan toggle → **Save**.

Nomor 2 penting: selama aktif, siapa pun bisa membuat sesi tanpa akun. Aplikasi
tidak memakai fitur ini sama sekali.

---

## BAGIAN 3 — Email (untuk lupa password & verifikasi daftar)

Login Google tidak butuh ini, tetapi **lupa password** dan **verifikasi email
pendaftaran** membutuhkannya.

### 3.1 — Atur SMTP

1. Supabase → **Authentication** → **Emails** / **SMTP Settings**.
2. Isi host, port (587), username, password, dan **sender email** dari penyedia
   email Anda (Resend, SendGrid, Gmail app password, dsb).
3. Kalau memakai Gmail, **From email** harus sama dengan akun Gmail-nya,
   kalau tidak email akan ditolak.
4. **Save**.

> Supabase punya pengirim bawaan untuk uji coba, tapi dibatasi beberapa email
> per jam dan sering masuk folder **Spam**. Untuk produksi, pakai SMTP sendiri.

### 3.2 — Cek template reset password

1. Supabase → **Authentication** → **Email Templates** → **Reset Password**.
2. Pastikan tautannya memakai variabel bawaan Supabase:
   ```
   {{ .ConfirmationURL }}
   ```
3. Jangan mengganti variabel itu dengan tautan manual; aplikasi mengandalkan
   `code` dari Supabase untuk menukar session.

### 3.3 — Kalau ingin verifikasi email saat daftar

Supabase → **Authentication** → **Sign In / Providers** → **Email** →
aktifkan **Confirm email**. Ini tidak memengaruhi login Google.

---

## BAGIAN 4 — Troubleshooting (gejala → penyebab → perbaikan)

### Login Google

| Pesan / gejala | Penyebab | Perbaikan |
| --- | --- | --- |
| `Error 400: redirect_uri_mismatch` | Redirect URI di Google ≠ callback Supabase | Isi `https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback` di **Authorized redirect URIs** |
| `Access blocked: MATCHPOIN has not completed the Google verification process` | App masih **Testing**, email belum terdaftar sebagai Test user | Tambah email ke Test users **atau** klik **Publish app** (langkah 2E) |
| `Error 403: access_denied` | Pengguna menutup jendela / menolak izin | Normal. Aplikasi menampilkan pesan Indonesia |
| Balik ke `/login?error=oauth_failed` | Client Secret salah, salah tempel, atau provider belum di-**Save** | Ulangi langkah 2D |
| Balik ke `/login?error=email_missing` | Akun Google tidak membagikan email (langka, biasanya akun Workspace terbatas) | Daftar dengan email & password |
| Tombol langsung memunculkan "belum diaktifkan" | Provider Google masih OFF di Supabase | Aktifkan di langkah 2D butir 4 |
| Halaman putih setelah pilih akun | Redirect URL aplikasi belum terdaftar | Tambahkan `https://matchpoin.vercel.app/auth/callback` di URL Configuration |

### Lupa password

| Pesan / gejala | Penyebab | Perbaikan |
| --- | --- | --- |
| Email tidak pernah sampai | SMTP belum diatur / masuk Spam | Bagian 3.1, cek folder Spam |
| Tautan mengarah ke `localhost:3000` | **Site URL** masih localhost | Ubah ke `https://matchpoin.vercel.app` (langkah 1.2) |
| Halaman **"Tautan Tidak Valid"** | Tautan sudah dipakai / kedaluwarsa (default 1 jam), atau `/reset-password` tidak ada di Redirect URLs | Minta tautan baru, dan tambahkan URL-nya (langkah 1.3) |
| Muncul **"Gagal masuk dengan penyedia. Silakan coba lagi atau gunakan email"** setelah klik tautan reset | Bug lama: Supabase mengirim token pemulihan di **fragment** (`#access_token=...`), fragment tidak sampai ke server sehingga route `/auth/callback` melihat `code` kosong dan menganggapnya kegagalan OAuth | Sudah diperbaiki. Pastikan deploy memakai versi terbaru (commit `fix(auth): tautan reset...`). Ciri sudah benar: setelah klik tautan langsung tampil **Buat Password Baru** |
| Berhasil isi password tapi tidak bisa login | Password < 6 karakter atau email salah ketik | Ulangi dari `/forgot-password` |
| Setelah simpan password malah terlempar ke beranda | Middleware menganggap sesi sudah aktif — di kode ini dibiarkan agar halaman tetap terbuka | Tidak perlu tindakan |

---

## BAGIAN 4B — Cek otomatis sekali jalan

Semua pemeriksaan di atas bisa dijalankan ulang kapan saja tanpa membuka
dashboard:

```bash
npm run audit:auth
```

Script ini memeriksa: provider Google/email aktif, client ID terbaca, callback
Google diterima Google Cloud, Google menolak `redirect_uri` asing, Site URL
bukan localhost, tidak ada wildcard di Redirect URLs, serta deploy produksi
memakai project Supabase yang sama dan tombol Google tampil.

Contoh keluaran sehat:

```
[OK  ] Provider Google: aktif
[OK  ] Client ID Google: 79069845555-...apps.googleusercontent.com
[OK  ] Callback Google: https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback
[OK  ] Izin redirect di Google Cloud: callback Supabase diterima Google
[OK  ] Validasi Google: redirect_uri asing ditolak (sesuai harapan)
[OK  ] Site URL: mengarah ke https://matchpoin.vercel.app
[OK  ] Redirect URLs: domain asing ditolak / dikembalikan ke Site URL
[OK  ] Tombol Google di produksi: tampil di /login
[OK  ] Tombol Facebook: sudah tidak ada

0 gagal, 0 peringatan.
```

Skrip ini **tidak** bisa: menyalakan provider, mem-publish app Google, atau
mengisi SMTP — semuanya butuh akun dashboard Anda.

## BAGIAN 5 — Checklist akhir (centang satu per satu)

**Supabase → Authentication → URL Configuration**
- [ ] Site URL = `https://matchpoin.vercel.app`
- [ ] `https://matchpoin.vercel.app/auth/callback` terdaftar
- [ ] `https://matchpoin.vercel.app/reset-password` terdaftar
- [ ] `http://localhost:3000/auth/callback` terdaftar (untuk dev)
- [ ] `http://localhost:3000/reset-password` terdaftar (untuk dev)

**Google Cloud Console**
- [ ] OAuth consent screen terisi, scopes email + profile
- [ ] OAuth client tipe **Web application** dibuat
- [ ] Authorized JavaScript origins: `http://localhost:3000`, `https://matchpoin.vercel.app`
- [ ] Authorized redirect URI: `https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback`
- [ ] Publishing status = **In production**

**Supabase → Authentication → Providers**
- [ ] Google: **enabled**, Client ID & Secret terisi, **Save**
- [ ] Facebook: **disabled**
- [ ] Anonymous sign-ins: **disabled**
- [ ] `npm run audit:auth` → 0 gagal

**Login → uji di production**
- [ ] "Masuk dengan Google" untuk akun baru → sampai `/dashboard`
- [ ] Batalkan proses → muncul pesan "Anda membatalkan proses masuk..."
- [ ] Lupa password → email masuk → halaman "Buat Password Baru" → login dengan password baru
- [ ] Daftar dengan email → verifikasi → login

---

## BAGIAN 6 — Migrasi database

Seluruh migrasi `supabase/migrations/00034`–`00039` **sudah** diterapkan di
project live. Buktinya, kolom penanda berikut terbaca dari database:

- `public.users.is_dummy`
- `public.player_profiles.is_dummy`
- `public.player_profiles.last_seen_at`
- `public.public_players.is_dummy`

Kalau suatu saat membuat project Supabase baru, jalankan **semua** file migrasi
berurutan di **SQL Editor**, dari nomor terkecil ke terbesar.

Verifikasi cepat dari terminal:

```bash
node --env-file=.env.local -e '
const {createClient}=require("@supabase/supabase-js");globalThis.WebSocket=require("ws");
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},realtime:{enabled:false}});
(async()=>{for(const [t,c] of [["users","is_dummy"],["player_profiles","last_seen_at"],["public_players","is_dummy"]]){
 const {error}=await sb.from(t).select(c).limit(1);
 console.log(`${t}.${c}:`, error? "BELUM ADA":"OK");}})()'
```

Akhir, uji juga login dengan akun dummy untuk melihat data seed:

```
email    : dummy-andi.pratama@matchpoin.test
password : Matchpoin123!
```