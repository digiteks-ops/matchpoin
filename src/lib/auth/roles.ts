export const APP_ROLES = ["player", "admin", "super_admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

const ROLE_RANK: Record<AppRole, number> = {
  player: 1,
  admin: 2,
  super_admin: 3,
};

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    (APP_ROLES as readonly string[]).includes(value)
  );
}

export function normalizeRoles(values: unknown): AppRole[] {
  const input = Array.isArray(values)
    ? values
    : typeof values === "string"
    ? values.split(",")
    : [];
  const roles = new Set<AppRole>();

  for (const value of input) {
    const role = typeof value === "string" ? value.trim() : "";
    if (isAppRole(role)) roles.add(role);
  }

  if (roles.size === 0) roles.add("player");
  return Array.from(roles);
}

export function highestRole(values: readonly AppRole[]): AppRole {
  return values.reduce<AppRole>(
    (highest, role) => (ROLE_RANK[role] > ROLE_RANK[highest] ? role : highest),
    "player"
  );
}

export function hasRole(values: readonly AppRole[], required: AppRole): boolean {
  return values.some((role) => ROLE_RANK[role] >= ROLE_RANK[required]);
}
