import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * League registration.
 *
 * All rules live in the `register_for_league` database function: quota is
 * counted in distinct entries (a doubles team costs one slot, not two), the
 * tournament must be open, a player may only hold one entry per category, and
 * a mixed-doubles pairing must be one man plus one woman. The route only
 * forwards the caller's choice and translates the returned reason into an
 * Indonesian message.
 */
export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Harap masuk untuk mendaftar liga." },
      { status: 401 }
    );
  }

  let body: { tournamentId?: string; partnerUserId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const tournamentId = (body.tournamentId ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json({ success: false, message: "ID Liga wajib diisi." }, { status: 400 });
  }

  const partnerUserId = body.partnerUserId?.trim() || null;

  try {
    const { data, error } = await supabase.rpc("register_for_league", {
      p_tournament_id: tournamentId,
      p_partner_user_id: partnerUserId,
    });

    if (error) {
      logError("league.register", error, { tournamentId, userId: user.id });
      return NextResponse.json(
        { success: false, message: "Gagal menyimpan pendaftaran. Coba lagi." },
        { status: 400 }
      );
    }

    const result = (data ?? {}) as { success?: boolean; message?: string };
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message || "Pendaftaran gagal." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || "Pendaftaran berhasil.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan pendaftaran.";
    logError("league.register.route", err, { tournamentId, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}