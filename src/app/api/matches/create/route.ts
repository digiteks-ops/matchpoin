// src/app/api/matches/create/route.ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createOpenMatch } from '@/lib/services/match-service';
import type { CreateOpenMatchInput } from '@/lib/services/match-service';
import { ERROR_CREATE_MATCH, logError } from '@/lib/errors';
import { getUserRoles } from '@/lib/supabase/rbac-service';
import { hasRole } from '@/lib/auth/roles';
import { VALID_CATEGORIES } from '@/lib/matches/constants';

export const dynamic = 'force-dynamic';

// Gunakan daftar kategori bersama (src/lib/matches/constants.ts) agar kategori
// liga baru seperti `womens_doubles_intermediate` tidak ditolak di sini.
const CATEGORIES = VALID_CATEGORIES;
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
  const matchType = payload.matchType ?? (isDoubles ? 'open' : 'private');

  if (matchType !== 'open' && matchType !== 'private') {
    return NextResponse.json({ success: false, message: 'Tipe pertandingan tidak valid.' }, { status: 400 });
  }

  let isAdmin = false;
  try {
    isAdmin = hasRole(await getUserRoles(user.id), 'admin');
  } catch (error) {
    logError('match.create.roles', error, { userId: user.id });
  }

  const cleanIds = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

  // Admins may create a match on behalf of two teams. When both sides are
  // provided we bypass the "organizer is a player" validation below.
  const explicitTeam1 = isAdmin ? cleanIds(payload.team1UserIds) : [];
  const explicitTeam2 = isAdmin ? cleanIds(payload.team2UserIds) : [];
  const usesExplicitTeams = explicitTeam1.length > 0 || explicitTeam2.length > 0;

  if (!usesExplicitTeams) {
    if (!isDoubles && (payload.partnerUserId || payload.opponentPartnerUserId)) {
      return NextResponse.json({ success: false, message: 'Partner hanya untuk pertandingan ganda.' }, { status: 400 });
    }

    if (!isDoubles && matchType === 'open' && payload.opponentUserId) {
      return NextResponse.json({ success: false, message: 'Pertandingan tunggal terbuka tidak dapat menentukan lawan manual.' }, { status: 400 });
    }

    if (payload.partnerUserId && payload.partnerUserId === user.id) {
      return NextResponse.json({ success: false, message: 'Partner tidak boleh sama dengan Host.' }, { status: 400 });
    }

    if (payload.opponentUserId && payload.opponentUserId === user.id) {
      return NextResponse.json({ success: false, message: 'Lawan tidak boleh sama dengan Host.' }, { status: 400 });
    }

    if (!isDoubles && matchType === 'private' && !payload.opponentUserId && !payload.team1UserIds?.length) {
      return NextResponse.json({ success: false, message: 'Pilih lawan untuk pertandingan tunggal (1 vs 1).' }, { status: 400 });
    }

    if (isDoubles && matchType === 'private') {
      if (!payload.partnerUserId) {
        return NextResponse.json({ success: false, message: 'Pilih partner untuk pertandingan ganda privat.' }, { status: 400 });
      }
      if (!payload.opponentUserId || !payload.opponentPartnerUserId) {
        return NextResponse.json({ success: false, message: 'Ganda privat wajib melengkapi 2 pemain lawan.' }, { status: 400 });
      }
    }

    if (isDoubles && matchType === 'open' && (payload.partnerUserId || payload.opponentUserId || payload.opponentPartnerUserId)) {
      return NextResponse.json({ success: false, message: 'Slot terbuka tidak dapat diisi pemain manual.' }, { status: 400 });
    }
  }

  // Kuota monetisasi dinonaktifkan untuk fase pertumbuhan 100-500 pengguna pertama (Unlimited)

  try {
    const matchId = await createOpenMatch(user.id, {
      ...payload,
      tournamentId: null,
      team1UserIds: usesExplicitTeams ? explicitTeam1 : undefined,
      team2UserIds: usesExplicitTeams ? explicitTeam2 : undefined,
      partnerUserId: usesExplicitTeams ? undefined : payload.partnerUserId,
      opponentUserId: usesExplicitTeams ? undefined : payload.opponentUserId,
      opponentPartnerUserId: usesExplicitTeams ? undefined : payload.opponentPartnerUserId,
      matchType: usesExplicitTeams ? 'private' : matchType,
    });
    return NextResponse.json({ success: true, matchId, message: 'Pertandingan dibuat.' });
  } catch (err) {
    logError('match.create.route', err, { userId: user.id, courtId: payload.courtId ?? null, courtName: payload.courtName ?? null });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_CREATE_MATCH },
      { status: 400 }
    );
  }
}