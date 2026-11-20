import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  isSupabaseAuthCookieName,
  POST_LOGOUT_PATH,
} from "@/lib/auth/protected-routes.mjs";

export const dynamic = "force-dynamic";

async function logout(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(
    new URL(POST_LOGOUT_PATH, request.nextUrl.origin)
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    });

    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Even if the Auth server is unreachable, the cookies below are cleared
      // so the browser session cannot be reused.
      console.error("Supabase signOut failed during logout; clearing cookies.", error);
    }
  }

  // Defensive cleanup for chunked/PKCE Supabase cookies in case signOut could
  // not reach the Auth server.
  for (const cookie of request.cookies.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      response.cookies.set({ name: cookie.name, value: "", maxAge: 0, path: "/" });
    }
  }

  return response;
}

export async function GET(request: NextRequest) {
  return logout(request);
}

export async function POST(request: NextRequest) {
  return logout(request);
}
