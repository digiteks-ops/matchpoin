import "server-only";
import { NextResponse } from "next/server";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { requireApiRole } from "@/lib/auth/guards";
import { assignRole, revokeRole, RbacError } from "@/lib/mysql/rbac-service";
import { isAppRole } from "@/lib/auth/roles";
import { logError } from "@/lib/errors";

interface Payload {
  userId?: unknown;
  role?: unknown;
  reason?: unknown;
  action?: unknown;
}

export async function POST(request: Request) {
  const guard = await requireApiRole("super_admin");
  if (guard instanceof NextResponse) return guard;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  }

  const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
  const role = payload.role;
  const action = payload.action === "revoke" ? "revoke" : "assign";
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 255) : "";

  if (!userId || !isAppRole(role)) {
    return NextResponse.json({ success: false, message: "User atau role tidak valid." }, { status: 400 });
  }
  if (action === "revoke" && !reason) {
    return NextResponse.json({ success: false, message: "Alasan pencabutan wajib diisi." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    if (action === "revoke") {
      await revokeRole(connection, userId, role, guard.session.user.id, reason);
    } else {
      await assignRole(connection, userId, role, guard.session.user.id, reason || null);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("admin-rbac", error, { action, role });
    return NextResponse.json(
      {
        success: false,
        message: error instanceof RbacError ? error.message : "Perubahan role gagal. Coba lagi.",
      },
      { status: 400 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
