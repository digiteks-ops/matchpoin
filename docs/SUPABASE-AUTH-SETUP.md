# Setup Authentication Supabase — URL Configuration & Providers

Panduan langkah demi langkah untuk membuat **Daftar/Masuk dengan Google & Facebook**
dan **lupa password** berfungsi di produksi.

Data proyek MATCHPOIN:

| Item | Nilai |
| --- | --- |
| Project ref | `flbiltsyobllkxydyufq` |
| URL Supabase | `https://flbiltsyobllkxydyufq.supabase.co` |
| Domain produksi | `https://matchpoin.vercel.app` |
| Domain lokal | `http://localhost:3000` |
| Callback aplikasi | `/auth/callback` (ada di `src/app/auth/callback/route.ts`) |
| Callback Supabase (untuk provider) | `https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback` |

---

## Bagian 1 — URL Configuration (wajib, lakukan pertama)

Tanpa langkah ini, tautan lupa password dan login Google/Facebook akan
kembali ke halaman error atau ke `localhost`.

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard) → pilih project
   **matchpoin**.
2. Menu kiri → **Authentication** → **URL Configuration**.
3. **Site URL** — isi:
   ```
   https://matchpoin.vercel.app
   ```
   Site URL adalah alamat default bila `redirectTo` tidak dikirim. Di produksi
   harus domain Vercel, bukan localhost.
4. **Redirect URLs** — klik **Add URL** untuk setiap baris berikut (harus
   persis, termasuk `https://` dan tanpa garis miring di akhir):

   ```
   https://matchpoin.vercel.app/auth/callback
   https://matchpoin.vercel.app/reset-password
   http://localhost:3000/auth/callback
   http://localhost:3000/reset-password
   ```

   Penjelasan:
   - `/auth/callback` — dipakai login Google/Facebook **dan** tautan lupa
     password (aplikasi menukar `code` menjadi session di sini, lalu
     meneruskan ke `/reset-password`).
   - `/reset-password` — halaman ganti password setelah email reset diklik.
   - Dua entri `localhost` hanya untuk pengembangan; boleh dihapus saat
     produksi benar-benar jalan, tetapi tidak berbahaya bila dibiarkan.

   Bila memakai domain sendiri nanti (mis. `https://matchpoin.id`), tambahkan
   juga:
   ```
   https://matchpoin.id/auth/callback
   https://matchpoin.id/reset-password
   ```
5. Klik **Save**.

### Cek cepat setelah Save

- Buka `https://matchpoin.vercel.app/forgot-password`, isi email sendiri,
  kirim, lalu klik tautan di email. Harusnya terbuka halaman
  **Buat Password Baru**, bukan halaman error atau beranda.
- Bila tautan mengarah ke `localhost:3000` padahal dibuka dari email di HP,
  berarti **Site URL** masih `http://localhost:3000` — ulangi langkah 3.

---

## Bagian 2 — Provider Google

### 2a. Buat OAuth Client di Google Cloud Console

1. Buka [console.cloud.google.com](https://console.cloud.google.com) → buat
   project baru (mis. `MATCHPOIN`) atau pilih yang sudah ada.
2. Menu → **APIs & Services** → **OAuth consent screen**:
   - User type: **External** → **Create**.
   - App name: `MATCHPOIN`, email dukungan: email Anda.
   - Scopes: cukup `userinfo.email` dan `userinfo.profile` (default).
   - Test users: tambahkan email Anda selama status masih **Testing**.
   - Setelah selesai uji, klik **Publish app** agar pemain lain bisa masuk.
3. Menu → **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID**:
   - Application type: **Web application**.
   - Name: `MATCHPOIN Web`.
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     https://matchpoin.vercel.app
     ```
   - **Authorized redirect URIs** — ini WAJIB alamat Supabase, bukan alamat
     aplikasi:
     ```
     https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback
     ```
   - Klik **Create** → salin **Client ID** dan **Client Secret**.

### 2b. Tempel ke Supabase

1. Supabase Dashboard → **Authentication** → **Providers** (atau
   **Sign In / Providers**) → **Google** → aktifkan.
2. Tempel **Client ID** dan **Client Secret** dari langkah 2a → **Save**.
3. Salin nilai **Callback URL (for OAuth)** yang ditampilkan Supabase dan
   pastikan sama persis dengan redirect URI di Google Cloud.

### Kalau gagal, pesannya begini

| Pesan | Penyebab | Perbaikan |
| --- | --- | --- |
| `redirect_uri_mismatch` | Redirect URI di Google tidak sama dengan callback Supabase | Tambahkan `https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback` |
| `Access blocked: app not verified` | App masih status Testing | Tambahkan email sebagai Test user, atau Publish app |
| Aplikasi kembali ke `/login?error=oauth_failed` | Client Secret salah / provider belum Save | Ulangi 2b |

---

## Bagian 3 — Provider Facebook

Facebook lebih ketat: aplikasi harus **Live** dan wajib punya URL kebijakan
privasi.

### 3a. Buat App di Meta for Developers

1. Buka [developers.facebook.com/apps](https://developers.facebook.com/apps) →
   **Create App**.
2. Use case: **Authenticate and request data from users with Facebook Login** →
   tipe **Consumer** → beri nama `MATCHPOIN` → **Create app**.
3. Di dashboard app → **Add product** → **Facebook Login** → **Set up**.
4. **Facebook Login** → **Settings**:
   - **Client OAuth Login**: ON
   - **Web OAuth Login**: ON
   - **Enforce HTTPS**: ON
   - **Valid OAuth Redirect URIs**:
     ```
     https://flbiltsyobllkxydyufq.supabase.co/auth/v1/callback
     ```
   - **Save changes**.
5. **Settings** → **Basic**:
   - **App Domains**: `flbiltsyobllkxydyufq.supabase.co` dan
     `matchpoin.vercel.app` (satu per baris bila kolom mendukung).
   - **Privacy Policy URL**: `https://matchpoin.vercel.app/privacy`
   - **User Data Deletion**: `https://matchpoin.vercel.app/privacy#hapus-data`
   - **Category**: Sports.
   - Salin **App ID** dan **App Secret** (tombol **Show**).
6. **App Mode**: ubah dari **Development** ke **Live** (toggle di atas
   dashboard). Selama Development, hanya admin/tester app yang bisa masuk.

### 3b. Tempel ke Supabase

1. Supabase Dashboard → **Authentication** → **Providers** → **Facebook** →
   aktifkan.
2. Tempel **App ID** sebagai Client ID dan **App Secret** sebagai Client Secret
   → **Save**.

### Catatan penting soal email Facebook

Sebagian akun Facebook tidak membagikan email. Aplikasi menangani ini: sesi
dibatalkan dan pengguna diarahkan ke `/login?error=email_missing` dengan pesan
untuk memakai email/password. Ini perilaku yang disengaja, bukan bug.

| Pesan | Penyebab | Perbaikan |
| --- | --- | --- |
| `URL Blocked: This redirect failed...` | Valid OAuth Redirect URI belum diisi | Ulangi 3a langkah 4 |
| `App not active` | App masih Development | Ubah ke **Live** |
| Login berhasil di Facebook tapi balik ke `/login?error=email_missing` | Akun FB tanpa email | Masuk dengan email/password |

---

## Bagian 4 — Urutan uji yang disarankan

1. **Lupa password**: `/forgot-password` → email masuk → tautan → halaman
   "Buat Password Baru" → simpan → login dengan password baru.
2. **Daftar email**: `/register` → isi data → pilih self rating (wajib) →
   cek email verifikasi → login.
3. **Google**: `/login` → tombol Google → pilih akun → mendarat di
   `/dashboard`. Pemain baru otomatis diarahkan memilih kategori sekali.
4. **Facebook**: sama seperti Google. Bila akun tanpa email, pastikan muncul
   pesan yang jelas, bukan halaman kosong.

---

## Bagian 5 — Migrasi database

Semua migrasi `supabase/migrations/00034`–`00039` sudah diterapkan di project
live (kolom `is_dummy` dan `last_seen_at` sudah ada dan terbaca). Bila suatu
saat memakai project Supabase baru, jalankan seluruh file migrasi berurutan di
**SQL Editor**, mulai dari nomor terkecil.

Verifikasi cepat lewat terminal:

```bash
node --env-file=.env.local -e '
const {createClient}=require("@supabase/supabase-js");globalThis.WebSocket=require("ws");
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},realtime:{enabled:false}});
(async()=>{for(const [t,c] of [["users","is_dummy"],["player_profiles","last_seen_at"],["public_players","is_dummy"]]){
 const {error}=await sb.from(t).select(c).limit(1);
 console.log(`${t}.${c}:`, error? "BELUM ADA":"OK");}})()'
```