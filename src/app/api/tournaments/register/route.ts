import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, message: "Harap masuk untuk mendaftar liga." }, { status: 401 });
  }

  let body: { tournamentId?: string; partnerUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const { tournamentId, partnerUserId } = body;
  if (!tournamentId) {
    return NextResponse.json({ success: false, message: "ID Turnamen wajib diisi." }, { status: 400 });
  }

  // 1. Fetch tournament
  const { data: tournament, error: tourError } = await supabase
    .from("leagues")
    .select("id, name, max_players, status, category")
    .eq("id", tournamentId)
    .single();

  if (tourError || !tournament) {
    return NextResponse.json({ success: false, message: "Turnamen / Liga tidak ditemukan." }, { status: 404 });
  }

  const cat = (tournament as any).category || "mens_singles";
  const isDoubles = cat.includes("doubles");

  // 3. Doubles validation
  if (isDoubles) {
    if (!partnerUserId) {
      return NextResponse.json({ success: false, message: "Kategori ganda wajib memilih partner." }, { status: 400 });
    }
    if (partnerUserId === user.id) {
      return NextResponse.json({ success: false, message: "Partner tidak boleh sama dengan diri sendiri." }, { status: 400 });
    }

    // Cek partner exists
    const { data: partnerUser } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("id", partnerUserId)
      .maybeSingle();

    if (!partnerUser) {
      return NextResponse.json({ success: false, message: "Partner tidak ditemukan." }, { status: 404 });
    }
  }

  // 4. Cek kuota
  const { count: currentCount } = await supabase
    .from("league_participants")
    .select("id", { count: "exact", head: true })
    .eq("league_id", tournamentId);

  if ((currentCount ?? 0) >= (tournament.max_players || 12)) {
    return NextResponse.json({ success: false, message: "Kuota pendaftaran untuk kategori ini sudah penuh." }, { status: 400 });
  }

  // 5. Cek apakah user sudah terdaftar di kategori ini
  const { data: existingReg } = await supabase
    .from("league_participants")
    .select("id, user_id, partner_user_id")
    .eq("league_id", tournamentId);

  const alreadyRegistered = (existingReg ?? []).some((r: any) => {
    return r.user_id === user.id || r.partner_user_id === user.id;
  });

  if (alreadyRegistered) {
    return NextResponse.json({ success: false, message: "Anda sudah terdaftar di kategori ini." }, { status: 400 });
  }

  if (isDoubles && partnerUserId) {
    const partnerAlready = (existingReg ?? []).some((r: any) => {
      return r.user_id === partnerUserId || r.partner_user_id === partnerUserId;
    });
    if (partnerAlready) {
      return NextResponse.json({ success: false, message: "Partner yang Anda pilih sudah terdaftar di tim lain pada kategori ini." }, { status: 400 });
    }
  }

  // 6. Simpan pendaftaran ke league_participants
  const insertPayload: any = {
    league_id: tournamentId,
    user_id: user.id,
    joined_at: new Date().toISOString(),
  };

  if (isDoubles && partnerUserId) {
    insertPayload.partner_user_id = partnerUserId;
  }

  const { error: insertError } = await supabase
    .from("league_participants")
    .insert(insertPayload);

  if (insertError) {
    return NextResponse.json({ success: false, message: insertError.message || "Gagal menyimpan pendaftaran." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: isDoubles ? "Tim Anda berhasil didaftarkan ke MATCHPOIN League!" : "Anda berhasil terdaftar ke MATCHPOIN League!",
  });
}
