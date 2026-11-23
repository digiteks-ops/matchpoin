import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { createOpenMatch } from "@/lib/services/match-service";
import { VALID_CATEGORIES, type MatchCategory } from "@/lib/matches/constants";
import { getManagedLeague, getManagedTournamentCategory } from "@/lib/supabase/tournament-admin-service";

export const dynamic = "force-dynamic";

// Pakai daftar kategori bersama supaya kategori liga baru
// (`womens_doubles_intermediate`) tidak ditolak saat admin membuat match.
const CATEGORIES: MatchCategory[] = VALID_CATEGORIES;

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  const category = new URL(request.url).searchParams.get("category");
  try {
    const league = await getManagedLeague(params.id);
    if (!league) {
      return NextResponse.json({ success: false, message: "Turnamen tidak ditemukan." }, { status: 404 });
    }
    const matches = category
      ? league.matches.filter((match) => match.category === category)
      : league.matches;
    return NextResponse.json({ success: true, matches });
  } catch (error) {
    logError("admin.tournaments.matches.list", error, { tournamentId: params.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat pertandingan turnamen." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  let payload: {
    category?: unknown;
    team1UserIds?: unknown;
    team2UserIds?: unknown;
    title?: unknown;
    matchDate?: unknown;
    startTime?: unknown;
    durationMinutes?: unknown;
    courtName?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const category = typeof payload.category === "string" ? payload.category : "";
  if (!CATEGORIES.includes(category as MatchCategory)) {
    return NextResponse.json({ success: false, message: "Kategori tidak valid." }, { status: 400 });
  }

  const team1UserIds = cleanIds(payload.team1UserIds);
  const team2UserIds = cleanIds(payload.team2UserIds);
  const matchDate = typeof payload.matchDate === "string" ? payload.matchDate : "";
  const startTime = typeof payload.startTime === "string" ? payload.startTime : "";
  const courtName = typeof payload.courtName === "string" ? payload.courtName.trim() : "";
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Pertandingan Liga Tennis IKA17";

  if (!matchDate || !startTime || !courtName) {
    return NextResponse.json(
      { success: false, message: "Tanggal, jam, dan lapangan wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const tournament = await getManagedTournamentCategory(params.id);
    if (!tournament) {
      return NextResponse.json({ success: false, message: "Turnamen tidak ditemukan." }, { status: 404 });
    }
    if (tournament.category && tournament.category !== category) {
      return NextResponse.json(
        { success: false, message: "Kategori pertandingan tidak sesuai dengan turnamen." },
        { status: 400 }
      );
    }

    const matchId = await createOpenMatch(guard.session.user.id, {
      title,
      category: category as MatchCategory,
      tournamentId: params.id,
      matchType: "private",
      team1UserIds,
      team2UserIds,
      matchDate,
      startTime,
      durationMinutes: Number(payload.durationMinutes) || 60,
      courtName,
      province: tournament.province ?? "Sulawesi Selatan",
      cityName: tournament.cityName ?? "Makassar",
      umpireOption: "tanpa_wasit",
      raceToScore: 8,
      courtSwitchAt: 4,
    });

    return NextResponse.json({ success: true, matchId, message: "Pertandingan turnamen dibuat." });
  } catch (error) {
    logError("admin.tournaments.matches.create", error, { tournamentId: params.id });
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Gagal membuat pertandingan turnamen.",
      },
      { status: 400 }
    );
  }
}
