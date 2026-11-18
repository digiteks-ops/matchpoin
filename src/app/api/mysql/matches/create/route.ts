import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import {
  createMySqlMatch,
  MatchCreationError,
} from "@/lib/mysql/match-create-service";
import type { CreateOpenMatchInput } from "@/lib/matches/constants";

export const dynamic = "force-dynamic";

function isCreateMatchInput(value: unknown): value is CreateOpenMatchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (
    typeof input.title !== "string" ||
    typeof input.matchDate !== "string" ||
    typeof input.startTime !== "string" ||
    typeof input.category !== "string" ||
    typeof input.umpireOption !== "string"
  ) {
    return false;
  }
  const stringFields = [
    "description",
    "courtId",
    "courtName",
    "province",
    "cityName",
    "matchType",
    "umpireName",
    "level",
    "reclubLink",
    "partnerUserId",
    "opponentUserId",
    "opponentPartnerUserId",
  ];
  if (
    stringFields.some(
      (field) =>
        input[field] !== undefined &&
        input[field] !== null &&
        typeof input[field] !== "string"
    )
  ) {
    return false;
  }
  const numberFields = ["durationMinutes", "minRating", "maxRating", "raceToScore", "courtSwitchAt"];
  return numberFields.every(
    (field) => input[field] === undefined || typeof input[field] === "number"
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Masuk untuk membuat pertandingan." },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Permintaan tidak valid." },
      { status: 400 }
    );
  }
  if (!isCreateMatchInput(payload)) {
    return NextResponse.json(
      { success: false, message: "Lengkapi field pertandingan dengan benar." },
      { status: 400 }
    );
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;
    const matchId = await createMySqlMatch(connection, userId, payload);
    await connection.commit();
    transactionStarted = false;
    return NextResponse.json({
      success: true,
      matchId,
      message: "Pertandingan dibuat.",
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error instanceof MatchCreationError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    logError("mysql.match.create", error, { userId });
    return NextResponse.json(
      { success: false, message: "Pertandingan gagal dibuat." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
