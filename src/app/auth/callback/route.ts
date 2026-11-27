import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePlayerRecordsServer, recordLastSeenServer } from "@/lib/services/player-sync";
import { PASSWORD_RECOVERY_PATH } from "@/lib/auth/callback-url.mjs";

export const dynamic = "force-dynamic";

const ERROR_CODES: Record<string, string> = {
  access_denied: "oauth_denied",
  server_error: "oauth_failed",
  temporarily_unavailable: "oauth_failed",
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  const providerError = searchParams.get("error") || searchParams.get("error_code");

  const safeNextPath = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const isRecoveryRequest =
    safeNextPath === PASSWORD_RECOVERY_PATH || searchParams.get("type") === "recovery";

  // The provider can return an error before any code is issued (user denied
  // consent, provider outage, invalid redirect URI).
  if (providerError) {
    // Tautan pemulihan yang kedaluwarsa juga sampai ke sini dengan
    // error=access_denied. Jangan tampilkan pesan "gagal masuk dengan
    // penyedia" untuk konteks reset kata sandi.
    if (isRecoveryRequest) {
      return NextResponse.redirect(`${origin}${PASSWORD_RECOVERY_PATH}?error=expired`);
    }
    const mapped = ERROR_CODES[providerError] ?? "oauth_failed";
    return NextResponse.redirect(`${origin}/login?error=${mapped}`);
  }

  // Supabase mengirim tautan pemulihan kata sandi (dan OAuth implicit) sebagai
  // fragment: /auth/callback?next=/reset-password#access_token=...
  // Fragment tidak pernah sampai ke server, jadi di sini `code` memang kosong.
  // Jangan dilempar ke /login sebagai error — teruskan ke halaman tujuan dan
  // biarkan supabase-js menukar token dari fragment di browser.
  if (!code) {
    if (safeNextPath === PASSWORD_RECOVERY_PATH) {
      return NextResponse.redirect(`${origin}${PASSWORD_RECOVERY_PATH}`);
    }
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("OAuth callback error:", error?.message);
    // Tautan pemulihan kata sandi juga melewati route ini. Pesan "gagal masuk
    // dengan penyedia" menyesatkan di konteks itu, jadi arahkan ke halaman
    // reset dengan keterangan tautan kedaluwarsa.
    if (isRecoveryRequest) {
      return NextResponse.redirect(`${origin}${PASSWORD_RECOVERY_PATH}?error=expired`);
    }
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  // Some Google accounts do not share an email (rare, e.g. restricted
  // Workspace). Sign out so the half-created session cannot be used silently,
  // and ask the player to register with email instead.
  if (!data.user.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=email_missing`);
  }

  try {
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined);
    // Tidak ada kategori awal yang perlu dipilih: semua pemain baru mulai
    // dari MPR 1000 dan kategori ditentukan dari hasil pertandingan.
    await ensurePlayerRecordsServer(data.user.id, data.user.email, fullName);
  } catch (err) {
    console.error("OAuth player sync error:", err);
  }

  // Catat "terakhir login" untuk direktori pemain (/players). Best effort, dan
  // dijalankan setelah baris profil dibuat agar tidak ada yang terlewat.
  try {
    await recordLastSeenServer(data.user.id);
  } catch (err) {
    console.error("OAuth last-seen error:", err);
  }

  return NextResponse.redirect(`${origin}${safeNextPath}`);
}
