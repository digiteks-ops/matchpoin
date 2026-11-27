import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  CommunityError,
  updateCommunity,
  type CommunityInput,
} from "@/lib/supabase/community-service";

interface Payload {
  name?: unknown;
  city?: unknown;
  adminPhone?: unknown;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > max) return undefined;
  return text || null;
}

export async function PATCH(
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

  const input: Partial<CommunityInput> = {};
  if (payload.name !== undefined) {
    if (typeof payload.name !== "string") {
      return NextResponse.json(
        { success: false, message: "Nama komunitas tidak valid." },
        { status: 400 }
      );
    }
    const name = payload.name.trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { success: false, message: "Nama komunitas wajib diisi (2-80 karakter)." },
        { status: 400 }
      );
    }
    input.name = name;
  }

  const city = optionalText(payload.city, 80);
  const adminPhone = optionalText(payload.adminPhone, 32);
  if (city === undefined || adminPhone === undefined) {
    return NextResponse.json(
      { success: false, message: "Data komunitas tidak valid." },
      { status: 400 }
    );
  }
  if (payload.city !== undefined) input.city = city;
  if (payload.adminPhone !== undefined) input.adminPhone = adminPhone;

  if (Object.keys(input).length === 0) {
    return NextResponse.json(
      { success: false, message: "Tidak ada perubahan untuk disimpan." },
      { status: 400 }
    );
  }

  try {
    const community = await updateCommunity(
      guard.session.user.id,
      params.id,
      input
    );
    return NextResponse.json({ success: true, community });
  } catch (error) {
    logError("communities.update", error, {
      userId: guard.session.user.id,
      communityId: params.id,
    });
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof CommunityError
            ? error.message
            : "Pengaturan komunitas gagal disimpan. Coba lagi.",
      },
      { status: 400 }
    );
  }
}
