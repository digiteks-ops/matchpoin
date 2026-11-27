import { NextResponse } from "next/server";
import { autoConfirmDueMatches } from "@/lib/services/rating-service";
import { logError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    const summary = await autoConfirmDueMatches(100);
    return NextResponse.json({ success: true, ...summary });
  } catch (err: unknown) {
    logError("cron.auto_confirm", err);
    return NextResponse.json(
      { success: false, message: "Konfirmasi otomatis gagal." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
