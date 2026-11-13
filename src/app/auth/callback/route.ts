import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePlayerRecordsServer } from "@/lib/services/player-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("OAuth callback error:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  try {
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined);
    await ensurePlayerRecordsServer(
      data.user.id,
      data.user.email || "",
      fullName
    );
  } catch (err) {
    console.error("OAuth player sync error:", err);
  }

  const safeNext = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}