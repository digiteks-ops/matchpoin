# Liga Tennis IKA17 — Musim 1 2027

Dokumen ini menjelaskan aturan, alur, dan sistem penilaian **Liga Tennis IKA17** yang
dijalankan di platform MATCHPOIN. Seluruh angka di bawah diambil dari satu sumber kode
(`src/lib/tournaments/ika17-core.mjs` dan `src/lib/rating/mpr-core.mjs`) agar tidak ada
perbedaan antara penjelasan, tampilan aplikasi, dan perhitungan server.

---

## 1. Ringkasan

| Item | Keterangan |
| --- | --- |
| Nama liga | Liga Tennis IKA17 |
| Musim | Musim 1 2027 |
| Platform | MATCHPOIN (matchpoin.vercel.app) |
| Format | Liga berbasis MatchPoin Rating (MPR), dilanjutkan Main Event |
| Kategori | Single Man, Double Man, Double Woman |
| Kelas peserta | Beginner dan Intermediate — **dibentuk otomatis dari hasil pertandingan** |
| Lolos Main Event | 8 besar Beginner + 8 besar Intermediate setiap kategori |
| Syarat lolos | Minimal **17 pertandingan** tercatat selama periode liga |
| Kuota | Tanpa batas jumlah peserta per kategori |
| Syarat utama | Belum pernah mengikuti PORDA, PORPROV, atau PON |

**Inti konsep:** pemain tidak memilih level saat mendaftar. Semua pemain mulai dari
rating yang sama, bertanding, lalu **hasil pertandingan** yang menentukan apakah ia
masuk kelas Beginner atau Intermediate.

---

## 2. Timeline

| Fase | Tanggal | Yang terjadi |
| --- | --- | --- |
| Pendaftaran | **1 – 31 Desember 2026** | Pemain memilih kategori, mengisi pasangan (untuk ganda), konfirmasi syarat, dan bergabung ke grup WhatsApp liga |
| Verifikasi admin | Desember 2026 | Admin menerima atau menolak pendaftaran; kuota tidak dibatasi |
| Periode liga | **1 Januari – 31 Maret 2027** | Pertandingan berjalan; hasil diverifikasi; klasemen diperbarui |
| Penutupan klasemen | 31 Maret 2027 | Peringkat akhir per kelas dan per kategori dikunci |
| Main Event | **3 – 4 April 2027** | 16 peserta/tim teratas tiap kategori bertanding |

---

## 3. Kategori Pertandingan

| Kategori | Format | Peserta | Aturan gender |
| --- | --- | --- | --- |
| **Single Man** | Tunggal | 1 pemain | Khusus pemain putra |
| **Double Man** | Ganda | 2 pemain per tim | Khusus pemain putra |
| **Double Woman** | Ganda | 2 pemain per tim | Khusus pemain putri |

Catatan:

- Kategori ganda wajib memilih pasangan saat mendaftar; kategori tunggal tidak boleh
  memilih pasangan.
- Satu pemain boleh mendaftar di lebih dari satu kategori (mis. Single Man dan
  Double Man), tetapi hanya satu kali per kategori.
- Aturan gender di atas **hanya berlaku di liga/turnamen**. Pertandingan umum di luar
  turnamen bebas gender — host yang mengatur susunan pemain, termasuk putra vs putri.
- Format **Double Mix (ganda campuran)** tidak dibuka sebagai kategori liga. Format itu
  tetap tersedia untuk pertandingan umum.

---

## 4. Syarat & Cara Mendaftar

1. **Akun MATCHPOIN aktif** dan profil sudah diisi (nama, jenis kelamin, kota).
2. **Belum pernah mengikuti PORDA, PORPROV, atau PON.** Pernyataan ini dicentang saat
   mendaftar dan menjadi dasar verifikasi admin.
3. **Nomor WhatsApp aktif** — dipakai untuk koordinasi jadwal dan tautan grup liga.
4. Pilih kategori, lalu pilih pasangan bila kategori ganda.
5. Tunggu persetujuan admin. Status pendaftaran: `Menunggu` → `Diterima` atau `Ditolak`.
   Pendaftaran yang ditolak boleh diajukan ulang.

Pendaftaran hanya bisa dilakukan di dalam periode **1 – 31 Desember 2026 (WITA)**.

---

## 5. Kelas Beginner & Intermediate (Otomatis)

Kelas liga **tidak dipilih** oleh pemain. Sistem membentuknya dari MPR hasil pertandingan:

| Kelas | Syarat MPR | Keterangan |
| --- | --- | --- |
| **Beginner** | MPR < 1100 | Pemain baru (MPR awal 1000) otomatis di kelas ini |
| **Intermediate** | MPR ≥ 1100 | Naik kelas setelah rating melewati 1100 |

- Kategori **ganda** memakai **rata-rata MPR kedua pemain** untuk menentukan kelas tim
  dan untuk peringkat klasemen. Contoh: pasangan MPR 1000 + 1200 → MPR tim 1100 →
  kelas Intermediate.
- Kelas bisa berubah selama liga berjalan mengikuti pergerakan MPR. Klasemen selalu
  dihitung dari MPR terbaru.

---

## 6. MPR — MatchPoin Rating

MPR adalah satu-satunya rating pemain. **Setiap pemain hanya punya satu MPR**, dipakai
untuk tunggal maupun ganda.

### Aturan dasar

| Aturan | Nilai |
| --- | --- |
| Rating awal semua pemain baru | **1000** |
| Faktor K | **80** (tetap, tidak berubah menurut jumlah match) |
| Laga seimbang | **+40** untuk pemenang, **−40** untuk yang kalah |
| Sifat pergerakan | Dinamis mengikuti selisih rating lawan |
| Batas bawah | Tidak ada lantai — pemain yang terus kalah bisa turun di bawah 1000 |
| Kalibrasi | **2 pertandingan pertama** — rating bergerak, tetapi belum dianggap ranking resmi |

### Pergerakan dinamis

- Menang melawan lawan **lebih tinggi** → poin mendekati **+80**.
- Menang melawan lawan **lebih rendah** → poin lebih kecil dari +40.
- Kalah dari lawan **lebih rendah** → minus mendekati **−80**.
- Kalah dari lawan **lebih tinggi** → minus lebih kecil dari 40.
- Perubahan selalu **nol-sum**: poin yang didapat pemenang sama dengan yang hilang dari
  lawan.

### Tier MPR

| Tier | Rentang |
| --- | --- |
| Beginner | 0 – 1099 |
| Intermediate | 1100 – 1599 |
| Advanced | 1600 – 1999 |
| Expert | 2000+ |

### Ganda

MPR tim = rata-rata MPR kedua pemain. Kedua rekan menerima perubahan poin yang sama
besar. Hanya menang/kalah yang dihitung; pertandingan **walkover** dan **dibatalkan**
tidak mengubah MPR.

---

## 7. Format Laga & Urutan Klasemen (Berbasis MPR)

Tidak ada sistem poin liga terpisah (tidak ada poin menang 3 / kalah 0). Baik **Liga Turnamen** maupun **Pertandingan Umum** semuanya dinilai dan diurutkan menggunakan **MatchPoin Rating (MPR)**.

Urutan klasemen (dari prioritas tertinggi):

1. **MPR Tertinggi** (untuk ganda memakai rata-rata MPR kedua pemain)
2. **Jumlah kemenangan**
3. **Jumlah pertandingan**
4. **Urutan nama**

Klasemen dipisah **per kategori** dan **per kelas** (Beginner / Intermediate).

Pertandingan memakai format **race to 8** (setiap game dihitung, bukan set). Pertandingan walkover (WO) dicatat dengan skor `8 – 0` / `0 – 8` dan tidak mengubah MPR.

---

## 8. Aturan Pertandingan Liga

1. **Satu lawan maksimal satu kali.** Setiap peserta hanya boleh dipertemukan dengan
   lawan yang sama **1×** selama liga. Jadwal atau tantangan duplikat ditolak dengan
   pesan: *"Setiap peserta hanya boleh bertemu lawan yang sama maksimal 1x. Pasangan ini
   sudah pernah dijadwalkan di liga ini."* Aturan ini dijaga di aplikasi **dan** di
   database (trigger), sehingga dua jadwal yang dibuat hampir bersamaan tetap ditolak.
2. **Minimal 17 pertandingan** tercatat agar bisa dinyatakan lolos Main Event.
3. **Hasil harus terverifikasi.** Hasil yang masih menunggu konfirmasi tidak dihitung di
   klasemen dan tidak muncul di aktivitas publik.
4. **Jadwal yang dibatalkan boleh dijadwalkan ulang** — pertandingan berstatus
   `cancelled` tidak dihitung sebagai pertemuan.
5. **Kategori ganda:** satu tim terdiri dari 2 pemain; kedua pemain harus memenuhi aturan
   gender kategori (putra untuk Double Man, putri untuk Double Woman).

---

## 9. Kualifikasi Main Event

Setiap kategori menyediakan **16 slot**:

- **8 besar Beginner** (MPR < 1100)
- **8 besar Intermediate** (MPR ≥ 1100)

Syarat sah:

1. Peringkat masuk 8 besar di kelasnya, **dan**
2. Sudah menyelesaikan **minimal 17 pertandingan** selama periode liga.

Bila peringkat 8 besar belum memenuhi 17 pertandingan, slot ditandai
*"butuh N match lagi"*. Peringkat ditentukan dari **MPR tertinggi** di kelas tersebut,
dengan urutan pembantu: jumlah kemenangan, jumlah pertandingan, lalu nama.

Contoh: kategori Double Man dengan 40 tim. 20 tim berkelas Beginner dan 20 tim
Intermediate. Main Event Double Man diikuti 8 tim Beginner terbaik + 8 tim Intermediate
terbaik = **16 tim**.

---

## 10. Alur Pemain di Aplikasi

1. **Daftar** di halaman `/tournaments` atau `/league` — pilih kategori, pasangan, isi
   WhatsApp, centang pernyataan PORDA, lalu kirim.
2. **Menunggu verifikasi admin.** Setelah diterima, peserta tampil di daftar peserta dan
   klasemen kategori.
3. **Cari lawan** dari leaderboard turnamen — peserta yang sudah diterima melihat tombol
   **Pilih Lawan** pada baris peserta lain. Form pertandingan terbuka otomatis dengan
   lawan dan kategori sudah terisi (tunggal/ganda mengikuti kategori liga).
4. **Bertanding & catat hasil** — hasil diunggah, lalu dikonfirmasi pihak lawan/admin.
5. **Pantau klasemen** — poin, MPR, dan status Main Event diperbarui otomatis.
6. Setelah 17 pertandingan dan masuk 8 besar kelasnya, peserta berhak tampil di Main
   Event.

---

## 11. Peran Admin

- Menerima atau menolak pendaftaran (termasuk verifikasi pasangan dan aturan gender).
- Membuat jadwal pertandingan liga bila diperlukan.
- Memverifikasi hasil pertandingan; hasil yang belum terverifikasi tidak masuk klasemen.
- Menjaga agar tidak ada pasangan lawan yang bertemu lebih dari sekali.
- Menetapkan peserta Main Event setelah periode liga berakhir.

---

## 12. FAQ

**Apakah saya memilih Beginner atau Intermediate saat mendaftar?**
Tidak. Kelas dibentuk otomatis dari MPR hasil pertandingan Anda.

**Saya pemain baru. Berapa rating awal saya?**
1000 — otomatis masuk kelas Beginner.

**Apakah rating bisa turun?**
Ya. Tidak ada lantai; pemain yang terus kalah bisa turun di bawah 1000.

**Berapa pertandingan minimal untuk lolos?**
17 pertandingan tercatat selama 1 Januari – 31 Maret 2027.

**Bisakah bertemu lawan yang sama dua kali?**
Tidak. Sistem menolak jadwal duplikat, baik di aplikasi maupun di database.

**Bolehkah saya ikut lebih dari satu kategori?**
Boleh, satu pendaftaran per kategori. Contoh: Single Man dan Double Man.

**Apakah ganda campuran tersedia?**
Di liga tidak. Format ganda campuran tetap tersedia untuk pertandingan umum di luar
turnamen.

**Apakah hasil yang belum dikonfirmasi masuk klasemen?**
Tidak. Hanya hasil terverifikasi yang dihitung.

**Berapa biaya pendaftaran?**
Tidak ada biaya yang dipungut sistem; seluruh proses pendaftaran di aplikasi gratis.

---

## 13. Kontak & Tautan

| Keperluan | Tautan |
| --- | --- |
| Chat admin | https://wa.me/6285128066022 |
| Grup WhatsApp liga | https://chat.whatsapp.com/Lea6qDW5yuNAU5YruHALTV |
| Halaman liga | `/league` |
| Daftar kategori & aturan | `/tournaments` |
| Leaderboard turnamen | `/tournaments` (bagian Leaderboard Turnamen) |
| Papan peringkat pemain | `/leaderboard` |

---

*Angka pada dokumen ini mengikuti konfigurasi aplikasi. Bila panitia mengubah aturan,
ubah `src/lib/tournaments/ika17-core.mjs` dan `src/lib/rating/mpr-core.mjs` agar
dokumen, aplikasi, dan perhitungan server tetap konsisten.*
