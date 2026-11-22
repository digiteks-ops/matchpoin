// src/app/api/matches/[id]/join/route.ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requestJoinOpenMatch } from '@/lib/services/match-service';
import { notifyOpenMatchJoined } from '@/lib/notifications/notification-service';
import { logError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, message: 'Anda harus masuk untuk mengajukan partisipasi.' }, { status: 401 });
  }

  try {
    await requestJoinOpenMatch(params.id, user.id);

    try {
      const [{ data: match }, { data: profile }, { data: userRow }] = await Promise.all([
        supabase.from('matches').select('organizer_id, title').eq('id', params.id).maybeSingle(),
        supabase.from('public_players').select('display_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
      ]);
      if (match?.organizer_id && match.organizer_id !== user.id) {
        const playerName =
          (profile as { display_name?: string | null } | null)?.display_name ||
          (userRow as { full_name?: string | null } | null)?.full_name ||
          'Pemain';
        await notifyOpenMatchJoined(
          match.organizer_id,
          playerName,
          params.id,
          match.title ?? 'Pertandingan'
        );
      }
    } catch (notifyError) {
      logError('match.join.notify', notifyError, { matchId: params.id, userId: user.id });
    }

    return NextResponse.json({ success: true, message: 'Permohonan terkirim. Menunggu persetujuan host.' });
  } catch (err: any) {
    console.error('Join request error:', err);
    return NextResponse.json({ success: false, message: err.message || 'Gagal mengajukan permohonan.' }, { status: 400 });
  }
}
