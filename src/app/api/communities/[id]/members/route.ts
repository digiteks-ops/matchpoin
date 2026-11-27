import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  CommunityError,
  addCommunityMember,
  removeCommunityMember,
} from "@/lib/supabase/community-service";

interface Payload {
  playerId?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireApiRole("host");
  if (guard instanceof NextResponse) return guard;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  const playerId =
    typeof payload.playerId === "string" ? payload.playerId.trim() : "";
  if (!playerId) {
    return NextResponse.json(
      { success: false, message: "Pilih pemain terlebih dahulu." },
      { status: 400 }
    );
  }

  try {
    await addCommunityMember(guard.session.user.id, params.id, playerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("communities.members.add", error, {
      userId: guard.session.user.id,
      communityId: params.id,
    });
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof CommunityError
            ? error.message
            : "Gagal menambahkan pemain. Coba lagi.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireApiRole("host");
  if (guard instanceof NextResponse) return guard;

  const playerId =
    new URL(request.url).searchParams.get("playerId")?.trim() ?? "";
  if (!playerId) {
    return NextResponse.json(
      { success: false, message: "Pemain tidak valid." },
      { status: 400 }
    );
  }

  try {
    await removeCommunityMember(guard.session.user.id, params.id, playerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("communities.members.remove", error, {
      userId: guard.session.user.id,
      communityId: params.id,
    });
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof CommunityError
            ? error.message
            : "Gagal mengeluarkan pemain. Coba lagi.",
      },
      { status: 400 }
    );
  }
}
