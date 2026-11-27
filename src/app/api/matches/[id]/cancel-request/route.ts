// src/app/api/matches/[id]/cancel-request/route.ts
//
// Membatalkan permohonan slot milik sendiri (pemohon). Hanya permohonan yang
// masih berstatus menunggu yang dapat dibatalkan; setelah itu statusnya
// menjadi "cancelled" dan hilang dari daftar permohonan host.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelJoinRequest } from "@/lib/services/match-service";
import { logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk membatalkan permohonan." },
      { status: 401 }
    );
  }

  try {
    await cancelJoinRequest(params.id, user.id);
    return NextResponse.json({
      success: true,
      message: "Permohonan dibatalkan. Anda tidak lagi menunggu persetujuan host.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Permohonan gagal dibatalkan.";
    logError("match.cancel_request.route", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
