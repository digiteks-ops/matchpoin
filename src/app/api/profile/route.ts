import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { getProfile, updateProfile, type ProfileInput } from "@/lib/supabase/profile-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

const genders = new Set(["male", "female", "other", "prefer_not_to_say"]);
const visibilities = new Set(["public", "friends_only", "private"]);
const hands = new Set(["right", "left"]);
const backhands = new Set(["one_handed", "two_handed"]);
const frequencies = new Set(["daily", "weekly", "biweekly", "monthly", "occasional"]);
const levels = new Set(["beginner", "intermediate", "advanced", "expert"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseProfileInput(value: unknown): ProfileInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.fullName !== "string" ||
    !body.fullName.trim() ||
    body.fullName.trim().length > 50 ||
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
    (body.phone && body.phone.length > 32) ||
    (body.bio && body.bio.length > 5000) ||
    (body.playingSince && body.playingSince.length > 32)
  ) {
    return null;
  }
  return {
    fullName: body.fullName,
    phone: body.phone as string | null,
    gender: body.gender as ProfileInput["gender"],
    cityId: body.cityId as string | null,
    bio: body.bio as string | null,
    playingSince: body.playingSince as string | null,
    preferredHand: body.preferredHand as ProfileInput["preferredHand"],
    backhand: body.backhand as ProfileInput["backhand"],
    playFrequency: body.playFrequency as ProfileInput["playFrequency"],
    selfAssessedLevel: body.selfAssessedLevel as ProfileInput["selfAssessedLevel"],
    profileVisibility: body.profileVisibility as ProfileInput["profileVisibility"],
    preferredCategories: body.preferredCategories,
    preferredTimes: body.preferredTimes,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }

  try {
    const profile = await getProfile(user.id);
    if (!profile) {
      return NextResponse.json({ success: false, message: "Akun tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      ...profile,
      user: {
        ...profile.user,
        avatar_url: await signAvatarUrl(profile.user.avatar_url),
      },
    });
  } catch (error) {
    logError("profile.get", error, { userId: user.id });
    return NextResponse.json({ success: false, message: "Gagal memuat profil." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }
  const input = parseProfileInput(payload);
  if (!input) {
    return NextResponse.json(
      { success: false, message: "Data profil tidak valid." },
      { status: 400 }
    );
  }

  try {
    const result = await updateProfile(user.id, input);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logError("profile.update", error, { userId: user.id });
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Gagal menyimpan profil.",
      },
      { status: 400 }
    );
  }
}
