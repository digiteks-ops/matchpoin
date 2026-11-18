/**
 * RBAC core — shared by the typed server entry (rbac-service.ts) and by tests.
 *
 * Security rules enforced here (never in the browser):
 *  - a player may not grant or revoke any role
 *  - only a super admin may grant or revoke admin / super_admin
 *  - nobody may change their own roles through this path
 *  - every grant/revoke is written to role_audit_logs in the same transaction
 *  - a missing RBAC table fails closed (lowest privilege, never admin)
 */

const ROLE_RANK = { player: 1, admin: 2, super_admin: 3 };
const APP_ROLES = ["player", "admin", "super_admin"];

export function isAppRole(value) {
  return typeof value === "string" && APP_ROLES.includes(value);
}

export function normalizeRoles(values) {
  const input = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  const roles = new Set();
  for (const value of input) {
    const role = typeof value === "string" ? value.trim() : "";
    if (isAppRole(role)) roles.add(role);
  }
  if (roles.size === 0) roles.add("player");
  return Array.from(roles);
}

export function highestRole(values) {
  return (values ?? []).reduce(
    (highest, role) => (ROLE_RANK[role] > ROLE_RANK[highest] ? role : highest),
    "player"
  );
}

export function hasRole(values, required) {
  return (values ?? []).some((role) => ROLE_RANK[role] >= ROLE_RANK[required]);
}

export class RbacError extends Error {
  constructor(message) {
    super(message);
    this.name = "RbacError";
  }
}

function isMissingTableError(error) {
  return Boolean(error) && typeof error === "object" && error.code === "ER_NO_SUCH_TABLE";
}

export function assertActorCanManageRole({ actorId, targetUserId, role, actorRoles }) {
  if (!actorId) throw new RbacError("Aktor wajib diidentifikasi.");
  if (actorId === targetUserId) {
    throw new RbacError("User tidak dapat mengubah role miliknya sendiri.");
  }
  if (!hasRole(actorRoles, "admin")) {
    throw new RbacError("Aktor tidak memiliki izin mengelola role.");
  }
  if ((role === "admin" || role === "super_admin") && !hasRole(actorRoles, "super_admin")) {
    throw new RbacError("Hanya Super Admin yang dapat mengelola role Admin atau Super Admin.");
  }
}

async function lockRbacState(connection) {
  await connection.execute(
    "SELECT id FROM rbac_security_state WHERE id = 1 FOR UPDATE"
  );
}

async function roleIdByCode(connection, role) {
  const [rows] = await connection.execute("SELECT id FROM roles WHERE code = ? LIMIT 1", [role]);
  const row = rows[0];
  if (!row) throw new RbacError(`Role ${role} tidak ditemukan.`);
  return row.id;
}

async function getRolesStrict(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT roles.code FROM user_roles
     JOIN roles ON roles.id = user_roles.role_id
     WHERE user_roles.user_id = ? AND user_roles.revoked_at IS NULL`,
    [userId]
  );
  return normalizeRoles(rows.map((row) => row.code));
}

/**
 * Reads active roles. If RBAC tables do not exist yet, returns ["player"] so a
 * missing table can never grant elevated access.
 */
export async function getUserRoles(connection, userId) {
  try {
    return await getRolesStrict(connection, userId);
  } catch (error) {
    if (isMissingTableError(error)) return ["player"];
    throw error;
  }
}

async function assignInTransaction(connection, userId, role, actorId, reason) {
  await lockRbacState(connection);
  const actorRoles = await getRolesStrict(connection, actorId);
  assertActorCanManageRole({ actorId, targetUserId: userId, role, actorRoles });
  const roleId = await roleIdByCode(connection, role);
  await connection.execute(
    `INSERT INTO user_roles (id, user_id, role_id, assigned_by, reason)
     VALUES (UUID(), ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), assigned_at = UTC_TIMESTAMP(),
       reason = VALUES(reason), revoked_by = NULL, revoked_at = NULL`,
    [userId, roleId, actorId, reason]
  );
  await connection.execute(
    `INSERT INTO role_audit_logs (id, user_id, role_id, action, actor_id, reason)
     VALUES (UUID(), ?, ?, 'assigned', ?, ?)`,
    [userId, roleId, actorId, reason]
  );
}

export async function assignRole(connection, userId, role, actorId, reason = null) {
  await connection.beginTransaction();
  try {
    await assignInTransaction(connection, userId, role, actorId, reason);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

/**
 * Grants the default player role on signup. Deliberately does not open a
 * transaction (it runs inside the registration transaction) and never audits,
 * because it is not a privilege escalation.
 */
export async function ensureDefaultRole(connection, userId) {
  try {
    const roleId = await roleIdByCode(connection, "player");
    await connection.execute(
      `INSERT INTO user_roles (id, user_id, role_id, reason)
       VALUES (UUID(), ?, ?, 'Default player role')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [userId, roleId]
    );
  } catch (error) {
    if (isMissingTableError(error) || (error && error.code === "ER_DUP_ENTRY")) return;
    throw error;
  }
}

export async function revokeRole(connection, userId, role, actorId, reason) {
  await connection.beginTransaction();
  try {
    await lockRbacState(connection);
    const actorRoles = await getRolesStrict(connection, actorId);
    assertActorCanManageRole({ actorId, targetUserId: userId, role, actorRoles });
    const roleId = await roleIdByCode(connection, role);
    const [result] = await connection.execute(
      `UPDATE user_roles SET revoked_by = ?, revoked_at = UTC_TIMESTAMP(), reason = ?
       WHERE user_id = ? AND role_id = ? AND revoked_at IS NULL`,
      [actorId, reason, userId, roleId]
    );
    if (!result || Number(result.affectedRows) !== 1) {
      throw new RbacError("Role aktif tidak ditemukan atau sudah dicabut.");
    }
    if (role === "super_admin") {
      const [remaining] = await connection.execute(
        `SELECT COUNT(*) AS total FROM user_roles
         JOIN roles ON roles.id = user_roles.role_id
         WHERE roles.code = 'super_admin' AND user_roles.revoked_at IS NULL`
      );
      if (Number(remaining?.[0]?.total ?? 0) === 0) {
        throw new RbacError("Tidak dapat mencabut Super Admin terakhir.");
      }
    }
    await connection.execute(
      `INSERT INTO role_audit_logs (id, user_id, role_id, action, actor_id, reason)
       VALUES (UUID(), ?, ?, 'revoked', ?, ?)`,
      [userId, roleId, actorId, reason]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

/**
 * One-time bootstrap of the very first super admin.
 * Never exposed through a public endpoint; callable only from a server-side
 * operator script that holds MATCHPOIN_BOOTSTRAP_SECRET.
 */
export async function bootstrapFirstSuperAdmin(
  connection,
  userId,
  operatorSecret,
  expectedSecret
) {
  if (!expectedSecret || !operatorSecret || operatorSecret !== expectedSecret) {
    throw new RbacError("Verifikasi operator ditolak.");
  }
  if (!userId) throw new RbacError("User target wajib diisi.");

  await connection.beginTransaction();
  try {
    await lockRbacState(connection);
    const [existing] = await connection.execute(
      `SELECT user_roles.user_id FROM user_roles
       JOIN roles ON roles.id = user_roles.role_id
       WHERE roles.code = 'super_admin' AND user_roles.revoked_at IS NULL LIMIT 1`
    );
    if (existing && existing[0]) {
      throw new RbacError("Super Admin sudah tersedia. Bootstrap tidak dapat diulang.");
    }
    const [users] = await connection.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!users || !users[0]) throw new RbacError("User target belum terdaftar.");
    const roleId = await roleIdByCode(connection, "super_admin");
    await connection.execute(
      `INSERT INTO user_roles (id, user_id, role_id, reason)
       VALUES (UUID(), ?, ?, 'Initial operator bootstrap')`,
      [userId, roleId]
    );
    await connection.execute(
      `INSERT INTO role_audit_logs (id, user_id, role_id, action, reason)
       VALUES (UUID(), ?, ?, 'assigned', 'Initial operator bootstrap')`,
      [userId, roleId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
