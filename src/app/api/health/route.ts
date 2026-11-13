import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const timestamp = new Date().toISOString();
  let supabaseStatus = "disconnected";
  let supabaseError = null;

  try {
    const supabase = createClient();
    // Test auth service status
    const { error } = await supabase.auth.getSession();
    if (!error) {
      supabaseStatus = "connected";
    } else {
      supabaseError = error.message;
    }
  } catch (err: any) {
    supabaseError = err?.message || "Unknown error";
  }

  return NextResponse.json({
    status: "ok",
    app: "MATCHPOIN V2",
    version: "2.0.0",
    timezone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Makassar",
    environment: process.env.NEXT_PUBLIC_APP_ENV || "development",
    timestamp,
    services: {
      supabase: {
        status: supabaseStatus,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "missing",
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "configured" : "missing",
        error: supabaseError,
      },
    },
  });
}
