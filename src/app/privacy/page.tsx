import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — MATCHPOIN",
  description:
    "Bagaimana MATCHPOIN mengumpulkan, menggunakan, menyimpan, dan menghapus data pemain, termasuk login Google/Facebook dan foto pertandingan.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      kind="privacy"
      title="Kebijakan Privasi MATCHPOIN"
      updatedAt="21 November 2026"
    >
      <p>
        MATCHPOIN (&quot;kami&quot;) adalah platform matchmaking dan turnamen tenis
        untuk komunitas di Makassar. Kebijakan ini menjelaskan data apa yang kami
        kumpulkan, mengapa, bagaimana disimpan, dan hak Anda. Dengan menggunakan
        MATCHPOIN, Anda menyetujui praktik yang dijelaskan di sini.
      </p>

      <h2>1. Data yang kami kumpulkan</h2>
      <ul>
        <li>
          <strong>Data akun:</strong> nama, alamat email, foto profil, dan kata sandi
          terenkripsi (hash) bila Anda mendaftar dengan email.
        </li>
        <li>
          <strong>Data login pihak ketiga:</strong> bila Anda memilih Google atau
          Facebook, kami menerima nama, email terverifikasi, dan foto profil dari
          penyedia tersebut. Kami tidak menerima kata sandi provider Anda.
        </li>
        <li>
          <strong>Profil pemain:</strong> jenis kelamin, kota, level, preferensi
          lapangan/waktu, dan informasi yang Anda isi sendiri.
        </li>
        <li>
          <strong>Data pertandingan &amp; turnamen:</strong> pendaftaran, pasangan
          ganda, hasil pertandingan, rating, dan riwayat.
        </li>
        <li>
          <strong>Foto:</strong> avatar profil dan foto bukti hasil pertandingan yang
          Anda unggah. Foto dikompresi di perangkat Anda sebelum diunggah.
        </li>
        <li>
          <strong>Data teknis:</strong> cookie sesi login, alamat IP, dan log error
          terbatas untuk keamanan dan stabilitas layanan.
        </li>
      </ul>

      <h2>2. Dasar penggunaan data</h2>
      <ul>
        <li>Menyediakan akun, profil, pencarian pemain, dan leaderboard.</li>
        <li>Memproses pendaftaran turnamen dan persetujuan admin.</li>
        <li>Menghitung rating dan menampilkan klasemen.</li>
        <li>Mengirim notifikasi dalam aplikasi terkait pertandingan/turnamen.</li>
        <li>Menjaga keamanan, mencegah penyalahgunaan, dan memenuhi kewajiban hukum.</li>
      </ul>

      <h2>3. Penyimpanan dan pemroses data</h2>
      <p>
        Data disimpan pada infrastruktur Supabase (PostgreSQL, Auth, Storage) dan
        aplikasi dijalankan di Vercel. Penyedia tersebut memproses data atas nama kami
        dengan kewajiban keamanan standar industri. Foto bukti hasil pertandingan
        dapat diakses oleh peserta pertandingan terkait dan admin untuk verifikasi.
      </p>

      <h2>4. Berbagi data</h2>
      <p>
        Kami tidak menjual data pribadi. Data hanya dibagikan kepada penyedia
        infrastruktur di atas, kepada admin turnamen yang berwenang, atau bila
        diwajibkan hukum. Profil publik (nama, kota, rating) dapat terlihat oleh
        pengguna lain sesuai pengaturan privasi profil Anda.
      </p>

      <h2>5. Penyimpanan dan penghapusan</h2>
      <p>
        Kami menyimpan data selama akun aktif dan selama diperlukan untuk keperluan
        turnamen, sengketa hasil, atau kewajiban hukum. Foto yang diganti akan dihapus
        dari penyimpanan; foto hasil pertandingan disimpan sebagai bukti selama
        diperlukan.
      </p>

      <h2 id="hapus-data">6. Cara menghapus akun dan data (Data Deletion)</h2>
      <p>
        Untuk meminta penghapusan akun dan data terkait, kirim email ke{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Permintaan%20Hapus%20Data%20MATCHPOIN`}>
          {LEGAL_CONTACT_EMAIL}
        </a>{" "}
        dengan subjek &quot;Permintaan Hapus Data MATCHPOIN&quot; dari alamat email
        akun Anda. Kami akan memverifikasi kepemilikan akun dan memproses permintaan
        dalam 30 hari. Data yang wajib disimpan untuk audit turnamen atau kewajiban
        hukum akan dianonimkan, bukan ditampilkan publik.
      </p>

      <h2>7. Hak Anda</h2>
      <ul>
        <li>Mengakses dan memperbarui data profil melalui halaman Profil.</li>
        <li>Meminta salinan atau koreksi data dengan menghubungi kami.</li>
        <li>Meminta penghapusan akun (lihat bagian 6).</li>
        <li>Menarik izin login Google/Facebook dengan memutus koneksi di pengaturan akun provider.</li>
      </ul>

      <h2>8. Anak-anak</h2>
      <p>
        Layanan ini ditujukan untuk pengguna berusia 13 tahun atau lebih. Pemain di
        bawah 18 tahun harus memiliki izin orang tua/wali. Kami tidak dengan sengaja
        mengumpulkan data anak di bawah 13 tahun.
      </p>

      <h2>9. Keamanan</h2>
      <p>
        Kata sandi disimpan sebagai hash oleh Supabase Auth. Akses data dibatasi
        dengan Row Level Security, peran admin diverifikasi di server, dan unggahan
        dibatasi ke folder pengguna atau peserta pertandingan. Tidak ada sistem yang
        sepenuhnya bebas risiko; laporkan insiden ke email kontak di atas.
      </p>

      <h2>10. Perubahan kebijakan</h2>
      <p>
        Kami dapat memperbarui kebijakan ini. Perubahan material akan diumumkan di
        aplikasi. Tanggal &quot;Terakhir diperbarui&quot; di atas menunjukkan versi
        yang berlaku.
      </p>

      <h2>11. Kontak</h2>
      <p>
        Pertanyaan tentang privasi: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
