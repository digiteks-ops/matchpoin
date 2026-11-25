import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePlayerRecordsServer, recordLastSeenServer } from "@/lib/services/player-sync";
import { PASSWORD_RECOVERY_PATH } from "@/lib/auth/callback-url.mjs";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ERROR_CODES: Record<string, string> = {
  access_denied: "oauth_denied",
  server_error: "oauth_failed",
  temporarily_unavailable: "oauth_failed",
};

/**
 * TRUE bila pemain belum pernah menetapkan kategori awal dan belum bertanding.
 * Kategori awal hanya dipilih sekali; setelah itu rating bergerak dari hasil
 * pertandingan.
 */
async function needsStartingRating(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { data, error } = await admin
    .from("player_ratings")
    .select("starting_rating_set_at, matches_played")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("OAuth starting-category read error:", error.message);
    return false;
  }

  // Baris rating belum ada (project lama): anggap perlu memilih.
  if (!data) return true;

  return !data.starting_rating_set_at && (data.matches_played ?? 0) === 0;
}

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

  let needsStartingCategory = false;

  try {
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined);
    const metaLevel = data.user.user_metadata?.starting_level;
    const startingLevel =
      metaLevel === "beginner" ||
      metaLevel === "intermediate" ||
      metaLevel === "advanced" ||
      metaLevel === "expert"
        ? metaLevel
        : undefined;
    await ensurePlayerRecordsServer(
      data.user.id,
      data.user.email,
      fullName,
      startingLevel
    );

    // `created` tidak bisa dipakai sebagai penanda pemain baru: trigger
    // handle_new_user sudah membuat baris public.users lebih dulu, jadi
    // ensurePlayerRecords selalu melaporkan created=false. Yang menentukan
    // adalah status kategori awal di player_ratings.
    if (!startingLevel) {
      needsStartingCategory = await needsStartingRating(data.user.id);
    }
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

  // OAuth tidak membawa pilihan kategori: pemain baru diarahkan memilih sekali.
  if (needsStartingCategory) {
    return NextResponse.redirect(
      `${origin}/pilih-kategori?next=${encodeURIComponent(safeNextPath)}`
    );
  }

  return NextResponse.redirect(`${origin}${safeNextPath}`);
}
