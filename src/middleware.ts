import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { mysqlPathForPrimaryRoute } from "@/lib/mysql/primary-route-map";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/mysql") ||
    pathname.startsWith("/api/mysql") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }
  if (process.env.NEXT_PUBLIC_MATCHPOIN_APP_BACKEND === "mysql") {
    const mysqlPath = mysqlPathForPrimaryRoute(pathname);
    if (mysqlPath) {
      const destination = request.nextUrl.clone();
      destination.pathname = mysqlPath;
      return NextResponse.redirect(destination);
    }
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};