import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { getLeagueOverview } from "@/lib/supabase/competition-service";
import { signAvatarUrl } from "@/lib/storage/supabase";
import { IKA17_CATEGORIES } from "@/lib/tournaments/ika17";

export const dynamic = "force-dynamic";

// Sumber tunggal kategori: `ika17-core.mjs` (Single Man, Double Man,
// Double Woman, Double Mix).
const CATEGORIES = new Set<string>(IKA17_CATEGORIES.map((entry) => entry.id));

export async function GET(
  _request: Request,
  { params }: { params: { category: string } }
) {
  if (!CATEGORIES.has(params.category)) {
    return NextResponse.json({ message: "Kategori liga tidak valid." }, { status: 400 });
  }

  try {
    const overview = await getLeagueOverview(params.category);
    return NextResponse.json({
      ...overview,
      participants: await Promise.all(
        overview.participants.map(async (participant) => ({
          ...participant,
          avatarUrl: await signAvatarUrl(participant.avatarUrl),
        }))
      ),
      standings: await Promise.all(
        overview.standings.map(async (standing) => ({
          ...standing,
          avatarUrl: await signAvatarUrl(standing.avatarUrl),
        }))
      ),
    });
  } catch (error) {
    logError("league.overview", error, { category: params.category });
    return NextResponse.json({ message: "Gagal memuat data liga." }, { status: 500 });
  }
}
