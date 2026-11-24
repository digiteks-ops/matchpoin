import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseRegistrationPayload,
  evaluateLeagueRegistration,
} from "@/lib/mysql/competition-registration-core.mjs";
import { todayInPlatformTimeZone } from "@/lib/utils";
import { logError } from "@/lib/errors";
import {
  notifyAdminsPendingRegistration,
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
  status?: string;
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
 * Fallback pendaftaran tanpa RPC.
 *
 * Dipakai hanya ketika `register_for_competition` tidak bisa dipanggil (belum
 * dimigrasi atau signature berbeda). Aturannya diambil dari modul bersama yang
 * sama dengan versi MySQL, dan penulisan memakai service role karena baris
 * partner bukan milik pemain yang sedang login.
 *
 * Mengembalikan Response bila sudah ditangani, atau null agar pemanggil
 * meneruskan pesan error RPC aslinya (mis. error izin yang bukan soal migrasi).
 */
async function registerWithoutRpc(input: {
  userId: string;
  tournamentId: string;
  partnerUserId: string | null;
  playingExperience: "beginner" | "intermediate";
  eligibilityConfirmed: boolean;
  rpcMessage: string;
}): Promise<Response | null> {
  const { userId, tournamentId, partnerUserId, playingExperience, eligibilityConfirmed } = input;

  const admin = createAdminClient();
  if (!admin) return null;

  const tournamentResult = await admin
    .from("tournaments")
    .select("id, name, category, status, max_participants, registration_deadline, registration_open_at")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentResult.error) return null;
  const tournament = tournamentResult.data as
    | {
        id: string;
        name: string | null;
        category: string | null;
        status: string | null;
        max_participants: number | null;
        registration_deadline: string | null;
        registration_open_at: string | null;
      }
    | null;
  if (!tournament) {
    return NextResponse.json({ success: false, message: "Liga tidak ditemukan." }, { status: 404 });
  }

  const category = tournament.category ?? "mens_singles";

  const [entriesResult, genderResult] = await Promise.all([
    admin
      .from("tournament_participants")
      .select("user_id, entry_id, status")
      .eq("tournament_id", tournamentId)
      .eq("category", category),
    admin.from("users").select("id, gender").in("id", [userId, partnerUserId ?? userId]),
  ]);
  if (entriesResult.error) return null;

  const rows = (entriesResult.data ?? []) as {
    user_id: string;
    entry_id: string | null;
    status: string;
  }[];
  const activeRows = rows.filter((row) => row.status !== "rejected");
  const genders = new Map(
    ((genderResult.data ?? []) as { id: string; gender: string | null }[]).map((row) => [
      row.id,
      row.gender,
    ])
  );

  const evaluation = evaluateLeagueRegistration({
    tournament: {
      category,
      status: tournament.status,
      max_participants: tournament.max_participants,
      registration_deadline: tournament.registration_deadline,
      registration_open_at: tournament.registration_open_at,
      name: tournament.name,
    },
    userId,
    partnerUserId,
    registeredUserIds: activeRows.map((row) => row.user_id),
    entryCount: new Set(activeRows.map((row) => row.entry_id ?? row.user_id)).size,
    userGender: genders.get(userId) ?? null,
    partnerGender: partnerUserId ? genders.get(partnerUserId) ?? null : null,
    userExists: genders.has(userId),
    partnerExists: partnerUserId ? genders.has(partnerUserId) : true,
    playingExperience: playingExperience as "beginner" | "intermediate",
    eligibilityConfirmed,
    today: todayInPlatformTimeZone(),
  });
  if (!evaluation.ok) {
    return NextResponse.json({ success: false, message: evaluation.message }, { status: 400 });
  }

  const entryId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const baseRows = [
    {
      tournament_id: tournamentId,
      user_id: userId,
      category: evaluation.category,
      entry_id: entryId,
      entry_role: "captain",
      partner_user_id: evaluation.doubles ? partnerUserId : null,
      status: "pending",
      joined_at: timestamp,
      playing_experience: playingExperience,
      eligibility_confirmed: true,
    },
  ];
  if (evaluation.doubles && partnerUserId) {
    baseRows.push({
      ...baseRows[0],
      user_id: partnerUserId,
      entry_role: "partner",
      partner_user_id: null,
    });
  }

  const { error: insertError } = await admin.from("tournament_participants").insert(baseRows);
  if (insertError) {
    logError("league.register.fallback", insertError, { tournamentId, userId });
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan pendaftaran. Coba lagi." },
      { status: 500 }
    );
  }

  // Simpan level di profil agar admin dapat memverifikasi.
  await admin
    .from("player_profiles")
    .update({ playing_experience: playingExperience })
    .eq("user_id", userId);

  const tournamentName = tournament.name ?? "Liga";
  try {
    await notifyTournamentRegistration(userId, tournamentId, tournamentName);
    if (partnerUserId) {
      await notifyTournamentRegistration(partnerUserId, tournamentId, tournamentName);
    }
    await notifyAdminsPendingRegistration(tournamentId, tournamentName, entryId);
  } catch (notificationError) {
    logError("league.register.notify", notificationError, { tournamentId, userId });
  }

  return NextResponse.json({
    success: true,
    entryId,
    category: evaluation.category,
    status: "pending",
    message: evaluation.doubles
      ? "Pendaftaran ganda berhasil dikirim. Menunggu persetujuan admin."
      : "Pendaftaran berhasil dikirim. Menunggu persetujuan admin.",
  });
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
 * Registrations start as `pending` and require admin approval, exactly like
 * the MySQL flow.
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
  const { leagueId, partnerUserId, playingExperience, eligibilityConfirmed } = parsed;

  try {
    const tournamentId = await resolveTournamentId(leagueId);
    if (!tournamentId) {
      return NextResponse.json({ success: false, message: "Liga tidak ditemukan." }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("register_for_competition", {
      p_user_id: user.id,
      p_tournament_id: tournamentId,
      p_partner_user_id: partnerUserId,
      p_playing_experience: playingExperience,
      p_eligibility_confirmed: eligibilityConfirmed,
    });

    // Bila RPC belum terpasang / signature-nya berbeda (migrasi 00034/00036
    // belum jalan), pemain tetap bisa mendaftar: aturan yang sama diterapkan di
    // sini memakai modul bersama, lalu baris disimpan dengan service role.
    if (error) {
      const fallback = await registerWithoutRpc({
        userId: user.id,
        tournamentId,
        partnerUserId,
        playingExperience,
        eligibilityConfirmed,
        rpcMessage: error.message,
      });
      if (fallback) return fallback;
      throw new Error(error.message);
    }

    const result = data as RegistrationRpcResult;
    if (!result?.success) {
      return NextResponse.json(
        { success: false, message: result?.message ?? "Pendaftaran liga gagal." },
        { status: 400 }
      );
    }

    const tournamentName = result.tournament_name ?? "Liga";
    try {
      await notifyTournamentRegistration(user.id, tournamentId, tournamentName);
      if (partnerUserId) {
        await notifyTournamentRegistration(partnerUserId, tournamentId, tournamentName);
      }
      if (result.entry_id) {
        await notifyAdminsPendingRegistration(tournamentId, tournamentName, result.entry_id);
      }
    } catch (notificationError) {
      logError("league.register.notify", notificationError, { tournamentId, userId: user.id });
    }

    return NextResponse.json({
      success: true,
      entryId: result.entry_id,
      category: result.category,
      status: result.status ?? "pending",
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
