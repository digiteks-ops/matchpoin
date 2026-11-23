import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/errors";
import { dtrStartingRating } from "@/lib/rating/dtr-core.mjs";

export const dynamic = "force-dynamic";

// Self rating saat mendaftar hanya dua pilihan (lihat formulir registrasi):
// beginner -> rating awal 1000, intermediate -> rating awal 1500.
// advanced & expert tetap dikenali agar akun lama tidak rusak, tapi tidak
// ditawarkan lagi di UI.
const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
type Level = (typeof LEVELS)[number];

function parseLevel(value: unknown): Level | null {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value)
    ? (value as Level)
    : null;
}

/**
 * Picks the starting DTR category exactly once. The database trigger enforces
 * the "once" rule (player_ratings.starting_rating_set_at), this route only
 * mirrors the same starting values for the OAuth path.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }

  const level = parseLevel((payload as { level?: unknown } | null)?.level);
  if (!level) {
    return NextResponse.json(
      { success: false, message: "Kategori awal tidak valid." },
      { status: 400 }
    );
  }

  const supabase = createClient();
  const { data: rating, error: ratingError } = await supabase
    .from("player_ratings")
    .select("matches_played, starting_rating_set_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (ratingError) {
    logError("starting-level.read", ratingError, { userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat data rating." },
      { status: 500 }
    );
  }

  if (rating?.starting_rating_set_at) {
    return NextResponse.json(
      { success: false, message: "Kategori awal sudah pernah ditetapkan." },
      { status: 409 }
    );
  }

  if (rating && rating.matches_played > 0) {
    return NextResponse.json(
      { success: false, message: "Kategori awal hanya bisa dipilih sebelum pertandingan pertama." },
      { status: 409 }
    );
  }

  const startingRating = dtrStartingRating(level);
  const admin = createAdminClient();
  const writer = admin ?? supabase;

  // The profile trigger sets the same value; writing it here as well keeps the
  // rating correct even when the trigger is not installed on an older project.
  const { error: profileError } = await writer.from("player_profiles").upsert(
    { user_id: user.id, self_assessed_level: level },
    { onConflict: "user_id" }
  );
  if (profileError) {
    logError("starting-level.profile", profileError, { userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan kategori awal." },
      { status: 500 }
    );
  }

  const { error: updateError } = await writer
    .from("player_ratings")
    .update({
      current_rating: startingRating,
      peak_rating: startingRating,
      starting_rating_set_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .is("starting_rating_set_at", null)
    .eq("matches_played", 0);

  if (updateError) {
    logError("starting-level.rating", updateError, { userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal menetapkan rating awal." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, startingRating });
}