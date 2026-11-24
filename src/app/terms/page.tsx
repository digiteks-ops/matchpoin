import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Ketentuan Layanan — MATCHPOIN",
  description:
    "Aturan penggunaan MATCHPOIN: akun, perilaku pemain, pertandingan, turnamen, konten, pembatasan tanggung jawab, dan kontak.",
};

export default function TermsPage() {
  return (
    <LegalPage kind="terms" title="Ketentuan Layanan MATCHPOIN" updatedAt="21 November 2026">
      <p>
        Ketentuan ini mengatur penggunaan platform MATCHPOIN. Dengan mendaftar atau
        menggunakan layanan, Anda menyetujui ketentuan ini. Jika tidak setuju,
        mohon tidak menggunakan layanan.
      </p>

      <h2>1. Kelayakan dan akun</h2>
      <ul>
        <li>Pengguna minimal berusia 13 tahun; di bawah 18 tahun wajib izin orang tua/wali.</li>
        <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi dan aktivitas akun Anda.</li>
        <li>Data akun harus benar. Akun tidak boleh dipindahtangankan tanpa persetujuan kami.</li>
        <li>Kami dapat menonaktifkan akun yang melanggar ketentuan atau membahayakan pengguna lain.</li>
      </ul>

      <h2>2. Perilaku pengguna</h2>
      <ul>
        <li>Bersikap sportif dan menghormati pemain, panitia, serta fasilitas lapangan.</li>
        <li>Dilarang menyebarkan konten palsu, SARA, pelecehan, atau spam undangan/pertandingan.</li>
        <li>Dilarang memalsukan hasil pertandingan, foto bukti, atau identitas pemain.</li>
        <li>Dilarang menyalahgunakan API, mencoba mengakses data pengguna lain, atau mengakali sistem rating.</li>
      </ul>

      <h2>3. Pertandingan dan hasil</h2>
      <ul>
        <li>Penyelenggara (host) menetapkan jadwal, lapangan, dan lawan pada mode privat.</li>
        <li>Pada mode Open Match, slot lawan dapat diambil pemain lain sesuai aturan yang ditampilkan.</li>
        <li>Hasil harus disertai bukti foto. Hasil dapat disengketakan sesuai batas waktu yang ditampilkan.</li>
        <li>Keputusan admin atas sengketa bersifat final untuk keperluan rating dan klasemen.</li>
      </ul>

      <h2>4. Turnamen dan liga</h2>
      <ul>
        <li>Pendaftaran berstatus menunggu sampai disetujui admin; kuota dihitung dari pendaftaran yang diterima.</li>
        <li>Peserta wajib memenuhi kategori (tunggal/ganda, gender) dan jadwal yang ditetapkan.</li>
        <li>Pendaftaran yang ditolak dapat disertai alasan. Keputusan panitia bersifat final.</li>
        <li>Biaya, hadiah, dan aturan khusus turnamen (jika ada) diumumkan pada halaman turnamen.</li>
      </ul>

      <h2>5. Konten pengguna</h2>
      <p>
        Anda memiliki hak atas foto dan konten yang Anda unggah. Dengan mengunggah,
        Anda memberi kami lisensi terbatas untuk menyimpan, menampilkan kepada peserta
        terkait/admin, dan mengompresi konten tersebut untuk menjalankan layanan. Anda
        menjamin konten tidak melanggar hak pihak lain.
      </p>

      <h2>6. Aktivitas olahraga dan risiko</h2>
      <p>
        Tenis adalah aktivitas fisik dengan risiko cedera. Anda bertanggung jawab atas
        kondisi kesehatan, pemanasan, perlengkapan, dan asuransi pribadi. MATCHPOIN
        memfasilitasi pertemuan pemain dan tidak menyelenggarakan pengawasan medis di
        lapangan. Patuhi aturan lapangan dan hukum setempat.
      </p>

      <h2>7. Layanan pihak ketiga</h2>
      <p>
        Login dapat menggunakan Google dan infrastruktur kami berjalan di Supabase dan
        Vercel. Penggunaan layanan tersebut juga tunduk pada ketentuan penyedia
        masing-masing. Kami tidak bertanggung jawab atas gangguan yang berasal dari
        layanan pihak ketiga.
      </p>

      <h2>8. Pembatasan tanggung jawab</h2>
      <p>
        Layanan disediakan &quot;sebagaimana adanya&quot;. Sejauh diizinkan hukum, kami
        tidak bertanggung jawab atas kerugian tidak langsung, cedera saat bertanding,
        kehilangan data akibat force majeure, atau tindakan pengguna lain. Tanggung
        jawab kami dibatasi pada jumlah biaya layanan yang Anda bayarkan (jika ada)
        dalam 12 bulan terakhir.
      </p>

      <h2>9. Penangguhan dan penghentian</h2>
      <p>
        Kami dapat menangguhkan atau menghentikan akses bila terjadi pelanggaran,
        penyalahgunaan, atau risiko keamanan. Anda dapat berhenti menggunakan layanan
        dan meminta penghapusan data sesuai Kebijakan Privasi.
      </p>

      <h2>10. Perubahan ketentuan</h2>
      <p>
        Kami dapat memperbarui ketentuan ini. Versi berlaku adalah yang tercantum pada
        tanggal &quot;Terakhir diperbarui&quot;. Penggunaan berkelanjutan setelah
        perubahan berarti Anda menyetujui versi baru.
      </p>

      <h2>11. Hukum yang berlaku dan kontak</h2>
      <p>
        Ketentuan ini tunduk pada hukum Republik Indonesia. Sengketa diupayakan
        diselesaikan secara musyawarah terlebih dahulu. Kontak:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
