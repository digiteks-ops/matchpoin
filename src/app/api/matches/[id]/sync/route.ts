import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMatchResultStatus } from "@/lib/services/rating-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: true, synced: false });
  }

  try {
    await syncMatchResultStatus(params.id);
    return NextResponse.json({ success: true, synced: true });
  } catch (err) {
    console.error("Sync result error:", err);
    return NextResponse.json({ success: false, synced: false }, { status: 200 });
  }
}