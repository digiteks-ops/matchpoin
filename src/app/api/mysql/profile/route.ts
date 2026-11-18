import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import {
  getMySqlProfile,
  updateMySqlProfile,
  type MySqlProfileInput,
} from "@/lib/mysql/profile-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

const genders = new Set(["male", "female", "other", "prefer_not_to_say"]);
const visibilities = new Set(["public", "friends_only", "private"]);
const hands = new Set(["right", "left"]);
const backhands = new Set(["one_handed", "two_handed"]);
const frequencies = new Set(["daily", "weekly", "biweekly", "monthly", "occasional"]);
const levels = new Set(["beginner", "intermediate", "advanced"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseProfileInput(value: unknown): MySqlProfileInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.fullName !== "string" ||
    !body.fullName.trim() ||
    body.fullName.length > 160 ||
    (body.phone !== null && typeof body.phone !== "string") ||
    (body.gender !== null && !genders.has(String(body.gender))) ||
    (body.cityId !== null && typeof body.cityId !== "string") ||
    (body.bio !== null && typeof body.bio !== "string") ||
    (body.playingSince !== null && typeof body.playingSince !== "string") ||
    typeof body.preferredHand !== "string" ||
    !hands.has(body.preferredHand) ||
    typeof body.backhand !== "string" ||
    !backhands.has(body.backhand) ||
    typeof body.playFrequency !== "string" ||
    !frequencies.has(body.playFrequency) ||
    typeof body.selfAssessedLevel !== "string" ||
    !levels.has(body.selfAssessedLevel) ||
    typeof body.profileVisibility !== "string" ||
    !visibilities.has(body.profileVisibility) ||
    !isStringArray(body.preferredCategories) ||
    !isStringArray(body.preferredTimes) ||
    body.preferredCategories.length > 10 ||
    body.preferredTimes.length > 10
  ) {
    return null;
  }
  if (
    body.phone && body.phone.length > 32 ||
    body.bio && body.bio.length > 5000 ||
    body.playingSince && body.playingSince.length > 32
  ) {
    return null;
  }
  return {
    fullName: body.fullName,
    phone: body.phone as string | null,
    gender: body.gender as MySqlProfileInput["gender"],
    cityId: body.cityId as string | null,
    bio: body.bio as string | null,
    playingSince: body.playingSince as string | null,
    preferredHand: body.preferredHand as MySqlProfileInput["preferredHand"],
    backhand: body.backhand as MySqlProfileInput["backhand"],
    playFrequency: body.playFrequency as MySqlProfileInput["playFrequency"],
    selfAssessedLevel: body.selfAssessedLevel as MySqlProfileInput["selfAssessedLevel"],
    profileVisibility: body.profileVisibility as MySqlProfileInput["profileVisibility"],
    preferredCategories: body.preferredCategories,
    preferredTimes: body.preferredTimes,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const profile = await getMySqlProfile(connection, userId);
    if (!profile) {
      return NextResponse.json({ success: false, message: "Akun tidak ditemukan." }, { status: 404 });
    }
    const user = {
      ...profile.user,
      avatar_url: await signAvatarUrl(profile.user.avatar_url),
    };
    return NextResponse.json({ success: true, ...profile, user });
  } catch (error) {
    logError("mysql.profile.get", error, { userId });
    return NextResponse.json(
      { success: false, message: "Gagal memuat profil." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Payload tidak valid JSON." }, { status: 400 });
  }
  const input = parseProfileInput(payload);
  if (!input) {
    return NextResponse.json({ success: false, message: "Data profil tidak valid." }, { status: 400 });
  }
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    const result = await updateMySqlProfile(connection, userId, input);
    await connection.commit();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (connection) await connection.rollback();
    logError("mysql.profile.update", error, { userId });
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Gagal menyimpan profil.",
      },
      { status: 400 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
