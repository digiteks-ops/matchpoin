// Pesan error autentikasi berbahasa Indonesia.
//
// Dipakai halaman Daftar dan Masuk. Sebelumnya pesan mentah Supabase (bahasa
// Inggris, mis. "Database error saving new user") tampil apa adanya ke pemain,
// sehingga tidak jelas apa yang harus dilakukan.
//
// "Daftar" dan "Masuk" memang berbeda:
//   daftar -> supabase.auth.signUp    (membuat akun baru)
//   masuk  -> supabase.auth.signInWithPassword (memakai akun yang sudah ada)
// Pesan di bawah dibuat supaya pemain tahu harus pindah ke halaman mana.

/** Error yang muncul saat MENDAFTAR akun baru. */
export function mapSignUpError(message) {
  const lower = String(message ?? "").toLowerCase();

  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "Email ini sudah terdaftar. Silakan masuk dengan email tersebut, atau gunakan fitur Lupa Kata Sandi.";
  }
  if (lower.includes("database error") || lower.includes("saving new user")) {
    return "Pendaftaran gagal karena masalah pada server. Coba lagi beberapa saat; bila tetap gagal, hubungi admin MATCHPOIN.";
  }
  if (lower.includes("password") && (lower.includes("at least") || lower.includes("weak"))) {
    return "Kata sandi terlalu lemah. Gunakan minimal 6 karakter.";
  }
  if (lower.includes("invalid email") || lower.includes("unable to validate email")) {
    return "Alamat email tidak valid. Periksa kembali penulisannya.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
  }
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled")) {
    return "Pendaftaran akun baru sedang dinonaktifkan. Hubungi admin MATCHPOIN.";
  }
  return `Pendaftaran gagal: ${message}`;
}

/** Error yang muncul saat MASUK ke akun yang sudah ada. */
export function mapSignInError(message) {
  const lower = String(message ?? "").toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Email atau kata sandi salah. Belum punya akun? Silakan daftar terlebih dahulu.";
  }
  if (lower.includes("email not confirmed")) {
    return "Email Anda belum diverifikasi. Periksa inbox email Anda, lalu coba masuk lagi.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.";
  }
  if (lower.includes("user not found")) {
    return "Akun dengan email ini tidak ditemukan. Silakan daftar terlebih dahulu.";
  }
  return `Gagal masuk: ${message}`;
}