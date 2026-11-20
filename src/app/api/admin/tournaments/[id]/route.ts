import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  getManagedLeague,
  updateManagedLeague,
  type LeagueInfoInput,
} from "@/lib/supabase/tournament-admin-service";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  try {
    const league = await getManagedLeague(params.id);
    if (!league) {
      return NextResponse.json({ success: false, message: "Turnamen tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ success: true, league });
  } catch (error) {
    logError("admin.tournaments.detail", error, { tournamentId: params.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat detail turnamen." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  let payload: Partial<LeagueInfoInput>;
  try {
    payload = (await request.json()) as Partial<LeagueInfoInput>;
  } catch {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const leagueName = typeof payload.leagueName === "string" ? payload.leagueName.trim() : "";
  const startDate = typeof payload.startDate === "string" ? payload.startDate.trim() : "";
  const endDate = typeof payload.endDate === "string" ? payload.endDate.trim() : "";
  const registrationDeadline =
    typeof payload.registrationDeadline === "string" && payload.registrationDeadline.trim()
      ? payload.registrationDeadline.trim()
      : null;
  const mainEventStart =
    typeof payload.mainEventStart === "string" && payload.mainEventStart.trim()
      ? payload.mainEventStart.trim()
      : null;
  const mainEventEnd =
    typeof payload.mainEventEnd === "string" && payload.mainEventEnd.trim()
      ? payload.mainEventEnd.trim()
      : null;

  if (!leagueName || leagueName.length > 120) {
    return NextResponse.json({ success: false, message: "Nama liga wajib diisi." }, { status: 400 });
  }
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    return NextResponse.json({ success: false, message: "Tanggal liga tidak valid." }, { status: 400 });
  }
  if (startDate > endDate) {
    return NextResponse.json(
      { success: false, message: "Tanggal mulai liga harus sebelum tanggal selesai." },
      { status: 400 }
    );
  }
  if (mainEventStart && mainEventEnd && mainEventStart > mainEventEnd) {
    return NextResponse.json(
      { success: false, message: "Tanggal main event tidak valid." },
      { status: 400 }
    );
  }

  try {
    const league = await getManagedLeague(params.id);
    if (!league) {
      return NextResponse.json({ success: false, message: "Turnamen tidak ditemukan." }, { status: 404 });
    }

    await updateManagedLeague(
      league.categories.map((category) => category.id),
      {
        leagueName,
        startDate,
        endDate,
        registrationDeadline,
        mainEventStart,
        mainEventEnd,
      }
    );

    return NextResponse.json({ success: true, message: "Info turnamen diperbarui." });
  } catch (error) {
    logError("admin.tournaments.update", error, { tournamentId: params.id });
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan info turnamen." },
      { status: 500 }
    );
  }
}
