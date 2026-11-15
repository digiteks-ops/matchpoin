// src/app/api/matches/[id]/join/route.ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requestJoinOpenMatch } from '@/lib/services/match-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, message: 'Anda harus masuk untuk mengajukan partisipasi.' }, { status: 401 });
  }

  try {
    await requestJoinOpenMatch(params.id, user.id);
    return NextResponse.json({ success: true, message: 'Anda berhasil bergabung dengan pertandingan.' });
  } catch (err: any) {
    console.error('Join request error:', err);
    return NextResponse.json({ success: false, message: err.message || 'Gagal mengajukan permohonan.' }, { status: 400 });
  }
}
