import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRegistrationPayload } from "@/lib/mysql/competition-registration-core.mjs";
import { logError } from "@/lib/errors";
import {
  notifySuperAdminsPendingRegistration,
  notifyTournamentRegistration,
} from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

interface RegistrationRpcResult {
  success: boolean;
  message: string;
  entry_id?: string;
  category?: string;
  tournament_name?: string;
  partner_user_id?: string | null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function resolveTournamentId(leagueId: string): Promise<string | null> {
  if (isUuid(leagueId)) return leagueId;
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const { data, error } = await admin
    .from("tournaments")
    .select("id")
    .eq("slug", leagueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * League registration on Supabase.
 *
 * The RPC `register_for_competition` owns the business rules atomically:
 * - quota counted in distinct entries (doubles team = 1 slot)
 * - tournament must be registration_open and before the deadline
 * - one entry per player per category
 * - mixed doubles: one male + one female
 * - partner required for doubles
 * Registrations start as `pending` and require Super Admin approval, exactly
 * like the MySQL flow.
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const parsed = parseRegistrationPayload(payload);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const { leagueId, partnerUserId } = parsed;

  try {
    const tournamentId = await resolveTournamentId(leagueId);
    if (!tournamentId) {
      return NextResponse.json({ success: false, message: "Liga tidak ditemukan." }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("register_for_competition", {
      p_user_id: user.id,
      p_tournament_id: tournamentId,
      p_partner_user_id: partnerUserId,
    });
    if (error) throw new Error(error.message);

    const result = data as RegistrationRpcResult;
    if (!result?.success) {
      return NextResponse.json(
        { success: false, message: result?.message ?? "Pendaftaran liga gagal." },
        { status: 400 }
      );
    }

    const tournamentName = result.tournament_name ?? "Liga";
    await notifyTournamentRegistration(user.id, tournamentId, tournamentName);
    if (partnerUserId) {
      await notifyTournamentRegistration(partnerUserId, tournamentId, tournamentName);
    }
    if (result.entry_id) {
      await notifySuperAdminsPendingRegistration(tournamentId, tournamentName, result.entry_id);
    }

    return NextResponse.json({
      success: true,
      entryId: result.entry_id,
      category: result.category,
      message: result.message,
    });
  } catch (err: unknown) {
    logError("league.register.route", err, { tournamentId: leagueId, userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan pendaftaran. Coba lagi." },
      { status: 500 }
    );
  }
}
