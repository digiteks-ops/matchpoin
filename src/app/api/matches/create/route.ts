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

  if (
    !payload.title ||
    !payload.courtId ||
    !payload.matchDate ||
    !payload.startTime ||
    !payload.category ||
    !payload.umpireOption
  ) {
    return NextResponse.json({ success: false, message: 'Lengkapi field wajib.' }, { status: 400 });
  }

  if (!CATEGORIES.includes(payload.category)) {
    return NextResponse.json({ success: false, message: 'Kategori tidak valid.' }, { status: 400 });
  }

  if (!UMPIRES.includes(payload.umpireOption)) {
    return NextResponse.json({ success: false, message: 'Pilihan wasit tidak valid.' }, { status: 400 });
  }

  try {
    const matchId = await createOpenMatch(user.id, payload);
    return NextResponse.json({ success: true, matchId, message: 'Pertandingan dibuat.' });
  } catch (err) {
    logError('match.create.route', err, { userId: user.id, courtId: payload.courtId });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_CREATE_MATCH },
      { status: 400 }
    );
  }
}