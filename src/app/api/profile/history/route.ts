import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerStats } from "@/lib/services/match-history-service";

export const dynamic = "force-dynamic";

async function handle(_request: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Harus login untuk melihat riwayat." },
      { status: 401 }
    );
  }

  try {
    const stats = await getPlayerStats(user.id);
    return NextResponse.json({ success: true, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memuat riwayat.";
    console.error("Profile history error:", err);
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}