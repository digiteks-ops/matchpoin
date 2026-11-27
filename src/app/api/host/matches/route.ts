import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  HostRecordError,
  recordHostMatch,
  type HostRecordInput,
} from "@/lib/services/host-record-service";
import { VALID_CATEGORIES, type MatchCategory } from "@/lib/matches/constants";

export const dynamic = "force-dynamic";

function parseTeam(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "size" in value &&
    "type" in value
  );
}

export async function POST(request: Request) {
  const guard = await requireApiRole("host");
  if (guard instanceof NextResponse) return guard;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  const category = String(form.get("category") ?? "");
  if (!VALID_CATEGORIES.includes(category as MatchCategory)) {
    return NextResponse.json(
      { success: false, message: "Kategori pertandingan tidak valid." },
      { status: 400 }
    );
  }

  const winnerTeam = Number(form.get("winnerTeam"));
  if (winnerTeam !== 1 && winnerTeam !== 2) {
    return NextResponse.json(
      { success: false, message: "Pemenang pertandingan tidak valid." },
      { status: 400 }
    );
  }

  const input: HostRecordInput = {
    matchDate: String(form.get("matchDate") ?? ""),
    category: category as MatchCategory,
    team1UserIds: parseTeam(form.get("team1")),
    team2UserIds: parseTeam(form.get("team2")),
    team1Score: Number(form.get("team1Score")),
    team2Score: Number(form.get("team2Score")),
    winnerTeam,
    photos: form.getAll("photos").filter(isUploadedFile),
  };

  try {
    const result = await recordHostMatch(guard.session.user.id, input);
    return NextResponse.json({
      success: true,
      ...result,
      message: "Hasil pertandingan dicatat dan menunggu konfirmasi pemain.",
    });
  } catch (error) {
    const status = error instanceof HostRecordError ? error.status : 500;
    if (status >= 500) {
      logError("host.record.route", error, { hostId: guard.session.user.id });
    }
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Hasil pertandingan gagal dicatat.",
      },
      { status }
    );
  }
}
