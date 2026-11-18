import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { registerForCompetition } from "@/lib/mysql/competition-service";

export const dynamic = "force-dynamic";

interface RegistrationRequest {
  tournamentId?: unknown;
  partnerUserId?: unknown;
}

function isRegistrationRequest(value: unknown): value is RegistrationRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
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
  if (!isRegistrationRequest(payload)) {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const tournamentId =
    typeof payload.tournamentId === "string" ? payload.tournamentId.trim() : "";
  const partnerUserId =
    typeof payload.partnerUserId === "string" ? payload.partnerUserId.trim() || null : null;
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (!isUuid(tournamentId)) {
    return NextResponse.json({ success: false, message: "ID Liga wajib diisi." }, { status: 400 });
  }
  if (payload.partnerUserId != null && typeof payload.partnerUserId !== "string") {
    return NextResponse.json({ success: false, message: "Partner tidak valid." }, { status: 400 });
  }
  if (partnerUserId && !isUuid(partnerUserId)) {
    return NextResponse.json({ success: false, message: "Partner tidak valid." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await registerForCompetition(connection, userId, tournamentId, partnerUserId);
    if (!result.success) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(result, { status: 400 });
    }
    await connection.commit();
    transactionStarted = false;
    return NextResponse.json(result);
  } catch (error) {
    if (transactionStarted && connection) {
      await connection.rollback();
    }
    if (isDuplicateEntryError(error)) {
      return NextResponse.json(
        { success: false, message: "Anda atau partner sudah terdaftar pada liga ini." },
        { status: 409 }
      );
    }
    logError("mysql.league.register", error, { tournamentId, userId });
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan pendaftaran. Coba lagi." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
