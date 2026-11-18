import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Connection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface ResetTokenRow extends RowDataPacket {
  user_id: string;
  is_valid: number;
}

interface CountRow extends RowDataPacket {
  request_count: number;
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPasswordResetRateLimitSubject(
  kind: "email" | "ip" | "reset-ip",
  value: string
): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 bytes for password recovery.");
  }
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

export function getPasswordRecoveryRequesterIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  return (
    cloudflareIp ??
    realIp ??
    forwardedFor?.split(",").at(-1) ??
    "unknown"
  )
    .trim()
    .slice(0, 128) || "unknown";
}

export async function incrementPasswordResetRateLimit(
  connection: Connection,
  subjectHash: string
): Promise<number> {
  await connection.execute(
    `INSERT INTO password_reset_rate_limits
       (subject_hash, window_started_at, request_count)
     VALUES (
       ?,
       FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(UTC_TIMESTAMP()) / 3600) * 3600),
       1
     )
     ON DUPLICATE KEY UPDATE request_count = request_count + 1`,
    [subjectHash]
  );
  const [rows] = await connection.execute<CountRow[]>(
    `SELECT request_count FROM password_reset_rate_limits
     WHERE subject_hash = ?
       AND window_started_at =
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(UTC_TIMESTAMP()) / 3600) * 3600)`,
    [subjectHash]
  );
  if (!rows[0]) throw new Error("Password reset rate-limit counter was not stored.");
  return Number(rows[0].request_count);
}

export async function createPasswordResetToken(
  connection: Connection,
  userId: string
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await connection.execute(
    `UPDATE password_reset_tokens
     SET consumed_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND consumed_at IS NULL`,
    [userId]
  );
  await connection.execute(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`,
    [randomUUID(), userId, hashPasswordResetToken(token)]
  );
  return token;
}

export async function consumePasswordResetToken(
  connection: Connection,
  token: string,
  passwordHash: string
): Promise<boolean> {
  const [rows] = await connection.execute<ResetTokenRow[]>(
    `SELECT user_id, (consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()) AS is_valid
     FROM password_reset_tokens
     WHERE token_hash = ?
     FOR UPDATE`,
    [hashPasswordResetToken(token)]
  );
  const reset = rows[0];
  if (!reset || !reset.is_valid) return false;

  await connection.execute(
    `UPDATE users
     SET password_hash = ?, auth_version = auth_version + 1
     WHERE id = ?`,
    [passwordHash, reset.user_id]
  );
  const [consumed] = await connection.execute<ResultSetHeader>(
    `UPDATE password_reset_tokens
     SET consumed_at = UTC_TIMESTAMP()
     WHERE token_hash = ? AND consumed_at IS NULL`,
    [hashPasswordResetToken(token)]
  );
  if (consumed.affectedRows !== 1) return false;

  await connection.execute(
    `UPDATE password_reset_tokens
     SET consumed_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND consumed_at IS NULL`,
    [reset.user_id]
  );
  return true;
}

export async function cleanupPasswordResetArtifacts(connection: Connection): Promise<void> {
  await connection.execute(
    `DELETE FROM password_reset_tokens
     WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 24 HOUR`
  );
  await connection.execute(
    `DELETE FROM password_reset_rate_limits
     WHERE window_started_at < UTC_TIMESTAMP() - INTERVAL 48 HOUR`
  );
}
