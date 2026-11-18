import type { Connection } from "mysql2/promise";
import type { AppRole } from "@/lib/auth/roles";

export function isAppRole(value: unknown): value is AppRole;
export function normalizeRoles(values: unknown): AppRole[];
export function highestRole(values: readonly AppRole[]): AppRole;
export function hasRole(values: readonly AppRole[], required: AppRole): boolean;

export class RbacError extends Error {}

export function assertActorCanManageRole(input: {
  actorId: string | null;
  targetUserId: string;
  role: AppRole;
  actorRoles: AppRole[];
}): void;

export function getUserRoles(
  connection: Connection,
  userId: string
): Promise<AppRole[]>;

export function assignRole(
  connection: Connection,
  userId: string,
  role: AppRole,
  actorId: string,
  reason?: string | null
): Promise<void>;

export function ensureDefaultRole(
  connection: Connection,
  userId: string
): Promise<void>;

export function revokeRole(
  connection: Connection,
  userId: string,
  role: AppRole,
  actorId: string,
  reason: string
): Promise<void>;

export function bootstrapFirstSuperAdmin(
  connection: Connection,
  userId: string,
  operatorSecret: string,
  expectedSecret: string
): Promise<void>;
