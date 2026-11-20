import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePlayerRecordsServer } from "@/lib/services/player-sync";

export const dynamic = "force-dynamic";

const ERROR_CODES: Record<string, string> = {
  access_denied: "oauth_denied",
  server_error: "oauth_failed",
  temporarily_unavailable: "oauth_failed",
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  const providerError = searchParams.get("error") || searchParams.get("error_code");

  // The provider can return an error before any code is issued (user denied
  // consent, provider outage, invalid redirect URI).
  if (providerError) {
    const mapped = ERROR_CODES[providerError] ?? "oauth_failed";
    return NextResponse.redirect(`${origin}/login?error=${mapped}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("OAuth callback error:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  // Facebook accounts may not expose an email. Sign out so the half-created
  // session cannot be used silently, and ask the player to use email instead.
  if (!data.user.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=email_missing`);
  }

  try {
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined);
    await ensurePlayerRecordsServer(data.user.id, data.user.email, fullName);
  } catch (err) {
    console.error("OAuth player sync error:", err);
  }

  const safeNext = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
