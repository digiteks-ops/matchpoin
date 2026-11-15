// src/app/api/matches/create/route.ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createOpenMatch } from '@/lib/services/match-service';
import type { CreateOpenMatchInput } from '@/lib/services/match-service';
import { ERROR_CREATE_MATCH, logError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles'];
const UMPIRES = ['dengan_wasit', 'tanpa_wasit'];

export async function POST(request: Request) {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: 'Masuk untuk membuat pertandingan.' },
      { status: 401 }
    );
  }

  let payload: CreateOpenMatchInput;
  try {
    payload = (await request.json()) as CreateOpenMatchInput;
  } catch {
    return NextResponse.json({ success: false, message: 'Permintaan tidak valid.' }, { status: 400 });
  }

  const hasCourt = Boolean(payload.courtId || (payload.courtName && payload.courtName.trim()));
  if (
    !payload.title ||
    !hasCourt ||
    !payload.matchDate ||
    !payload.startTime ||
    !payload.category ||
    !payload.umpireOption
  ) {
    return NextResponse.json({ success: false, message: 'Lengkapi field wajib.' }, { status: 400 });
  }

  if (!payload.courtId && payload.courtName && payload.courtName.trim().length < 2) {
    return NextResponse.json({ success: false, message: 'Nama lapangan minimal 2 karakter.' }, { status: 400 });
  }

  if (!CATEGORIES.includes(payload.category)) {
    return NextResponse.json({ success: false, message: 'Kategori tidak valid.' }, { status: 400 });
  }

  if (!UMPIRES.includes(payload.umpireOption)) {
    return NextResponse.json({ success: false, message: 'Pilihan wasit tidak valid.' }, { status: 400 });
  }

  const isDoubles = payload.category.includes('doubles');
  // Doubles default to an open match: the host leaves the partner and opponent
  // slots empty for other players to fill.
  const matchType = payload.matchType ?? (isDoubles ? 'open' : 'private');

  if (matchType !== 'open' && matchType !== 'private') {
    return NextResponse.json({ success: false, message: 'Tipe pertandingan tidak valid.' }, { status: 400 });
  }

  if (!isDoubles && matchType !== 'private') {
    return NextResponse.json({ success: false, message: 'Tipe pertandingan tidak valid.' }, { status: 400 });
  }

  if (!isDoubles && payload.partnerUserId) {
    return NextResponse.json({ success: false, message: 'Partner hanya untuk pertandingan ganda.' }, { status: 400 });
  }

  if (payload.partnerUserId && payload.partnerUserId === user.id) {
    return NextResponse.json({ success: false, message: 'Partner tidak boleh sama dengan Host.' }, { status: 400 });
  }

  if (isDoubles && matchType === 'private') {
    if (!payload.partnerUserId) {
      return NextResponse.json({ success: false, message: 'Pilih partner untuk pertandingan ganda privat.' }, { status: 400 });
    }
    if (!payload.opponentUserId || !payload.opponentPartnerUserId) {
      return NextResponse.json({ success: false, message: 'Ganda privat wajib melengkapi 2 pemain lawan.' }, { status: 400 });
    }
  }

  if (isDoubles && matchType === 'open' && (payload.opponentUserId || payload.opponentPartnerUserId)) {
    return NextResponse.json({ success: false, message: 'Slot lawan terbuka tidak dapat dipilih.' }, { status: 400 });
  }

  // Kuota monetisasi dinonaktifkan untuk fase pertumbuhan 100-500 pengguna pertama (Unlimited)

  try {
    const matchId = await createOpenMatch(user.id, payload);
    return NextResponse.json({ success: true, matchId, message: 'Pertandingan dibuat.' });
  } catch (err) {
    logError('match.create.route', err, { userId: user.id, courtId: payload.courtId ?? null, courtName: payload.courtName ?? null });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_CREATE_MATCH },
      { status: 400 }
    );
  }
}