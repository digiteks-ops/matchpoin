import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  CommunityError,
  createCommunity,
} from "@/lib/supabase/community-service";

interface Payload {
  name?: unknown;
  city?: unknown;
  adminPhone?: unknown;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > max) return undefined;
  return text || null;
}

export async function POST(request: Request) {
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

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const city = optionalText(payload.city, 80);
  const adminPhone = optionalText(payload.adminPhone, 32);

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { success: false, message: "Nama komunitas wajib diisi (2-80 karakter)." },
      { status: 400 }
    );
  }
  if (city === undefined || adminPhone === undefined) {
    return NextResponse.json(
      { success: false, message: "Data komunitas tidak valid." },
      { status: 400 }
    );
  }

  try {
    const community = await createCommunity(guard.session.user.id, {
      name,
      city,
      adminPhone,
    });
    return NextResponse.json({ success: true, community }, { status: 201 });
  } catch (error) {
    logError("communities.create", error, { userId: guard.session.user.id });
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof CommunityError
            ? error.message
            : "Komunitas gagal dibuat. Coba lagi.",
      },
      { status: 400 }
    );
  }
}
