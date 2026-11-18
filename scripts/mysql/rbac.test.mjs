import assert from "node:assert/strict";
import test from "node:test";
import {
  assignRole,
  bootstrapFirstSuperAdmin,
  ensureDefaultRole,
  getUserRoles,
  hasRole,
  revokeRole,
} from "../../src/lib/mysql/rbac-core.mjs";

const ROLES = { player: "role-player", admin: "role-admin", super_admin: "role-super" };

function createFakeConnection(options = {}) {
  const shared = options.sharedStore ?? null;
  const state = {
    roles: { ...ROLES },
    users: new Set(options.users ?? ["u-super", "u-admin", "u-player"]),
    assignments: shared
      ? shared.assignments
      : (options.assignments ?? []).map((row) => ({ ...row })),
    audit: shared ? shared.audit : [],
    failAudit: Boolean(options.failAudit),
    missingTables: Boolean(options.missingTables),
    missingLockTable: Boolean(options.missingLockTable),
    tx: [],
    ops: [],
  };
  let snapshot = null;
  let holdsLock = null;
  const mutex = options.mutex ?? null;

  const normalize = (query) => query.replace(/\s+/g, " ").trim();

  const releaseLock = () => {
    if (holdsLock) {
      const release = holdsLock;
      holdsLock = null;
      release();
    }
  };

  return {
    state,
    async beginTransaction() {
      snapshot = {
        assignments: state.assignments.map((row) => ({ ...row })),
        audit: state.audit.map((row) => ({ ...row })),
      };
      state.tx.push("begin");
    },
    async commit() {
      state.tx.push("commit");
      releaseLock();
      snapshot = null;
    },
    async rollback() {
      state.tx.push("rollback");
      if (snapshot) {
        state.assignments = snapshot.assignments;
        state.audit = snapshot.audit;
      }
      releaseLock();
      snapshot = null;
    },
    async execute(query, params = []) {
      const q = normalize(query);
      state.ops.push(q);

      if (q.startsWith("SELECT id FROM rbac_security_state")) {
        if (state.missingTables || state.missingLockTable) {
          const error = new Error("Table 'rbac_security_state' doesn't exist");
          error.code = "ER_NO_SUCH_TABLE";
          throw error;
        }
        if (mutex) {
          holdsLock = await mutex.acquire();
        }
        return [[{ id: 1 }], []];
      }

      if (state.missingTables) {
        const error = new Error("Table does not exist");
        error.code = "ER_NO_SUCH_TABLE";
        throw error;
      }

      if (q.startsWith("SELECT COUNT(*) AS total")) {
        const total = state.assignments.filter(
          (item) => item.roleId === state.roles.super_admin && !item.revokedAt
        ).length;
        return [[{ total }], []];
      }

      if (q.startsWith("SELECT id FROM roles WHERE code")) {
        const id = state.roles[params[0]];
        return [id ? [{ id }] : [], []];
      }

      if (q.includes("roles.code = 'super_admin'")) {
        const row = state.assignments.find(
          (item) => item.roleId === state.roles.super_admin && !item.revokedAt
        );
        return [row ? [{ user_id: row.userId }] : [], []];
      }

      if (q.startsWith("SELECT roles.code FROM user_roles")) {
        const userId = params[0];
        const rows = Object.entries(state.roles)
          .filter(([, roleId]) =>
            state.assignments.some(
              (item) => item.userId === userId && item.roleId === roleId && !item.revokedAt
            )
          )
          .map(([code]) => ({ code }));
        return [rows, []];
      }

      if (q.startsWith("INSERT INTO user_roles")) {
        const [userId, roleId] = params;
        const existing = state.assignments.find(
          (item) => item.userId === userId && item.roleId === roleId
        );
        if (existing) existing.revokedAt = null;
        else state.assignments.push({ userId, roleId, revokedAt: null });
        return [{ affectedRows: 1 }, []];
      }

      if (q.startsWith("UPDATE user_roles")) {
        const [actorId, reason, userId, roleId] = params;
        const row = state.assignments.find(
          (item) => item.userId === userId && item.roleId === roleId && !item.revokedAt
        );
        if (!row) return [{ affectedRows: 0 }, []];
        row.revokedAt = new Date().toISOString();
        row.revokedBy = actorId;
        row.reason = reason;
        return [{ affectedRows: 1 }, []];
      }

      if (q.startsWith("INSERT INTO role_audit_logs")) {
        if (state.failAudit) throw new Error("audit insert failed");
        state.audit.push({
          userId: params[0],
          roleId: params[1],
          action: q.includes("'revoked'") ? "revoked" : "assigned",
          actorId: params[2] ?? null,
          reason: q.includes("'Initial operator bootstrap'")
            ? "Initial operator bootstrap"
            : params[3] ?? null,
        });
        return [{ affectedRows: 1 }, []];
      }

      if (q.startsWith("SELECT id FROM users WHERE id")) {
        return [state.users.has(params[0]) ? [{ id: params[0] }] : [], []];
      }

      throw new Error(`Unexpected query in fake connection: ${q}`);
    },
  };
}

function withRole(userId, role) {
  return { userId, roleId: ROLES[role], revokedAt: null };
}

function createMutex() {
  let tail = Promise.resolve();
  return {
    acquire() {
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const waitFor = tail;
      tail = waitFor.then(() => held);
      return waitFor.then(() => release);
    },
  };
}

test("registration grants the player role", async () => {
  const connection = createFakeConnection();
  await ensureDefaultRole(connection, "u-new");
  assert.deepEqual(await getUserRoles(connection, "u-new"), ["player"]);
});

test("ensureDefaultRole is a no-op when RBAC tables are missing", async () => {
  const connection = createFakeConnection({ missingTables: true });
  await assert.doesNotReject(() => ensureDefaultRole(connection, "u-new"));
});

test("a player cannot grant any role", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-player", "player")],
  });
  await assert.rejects(
    () => assignRole(connection, "u-admin", "admin", "u-player", "escalate"),
    /izin mengelola role/
  );
  assert.equal(connection.state.assignments.filter((row) => row.userId === "u-admin").length, 0);
  assert.equal(connection.state.audit.length, 0);
  assert.ok(connection.state.tx.includes("rollback"));
});

test("an admin cannot grant super_admin", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-admin", "admin")],
  });
  await assert.rejects(
    () => assignRole(connection, "u-player", "super_admin", "u-admin", "escalate"),
    /Hanya Super Admin/
  );
  assert.equal(connection.state.audit.length, 0);
});

test("a super admin can grant the admin role", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin")],
  });
  await assignRole(connection, "u-player", "admin", "u-super", "promote");
  assert.deepEqual(await getUserRoles(connection, "u-player"), ["admin"]);
  assert.equal(connection.state.audit.at(-1).action, "assigned");
  assert.equal(connection.state.audit.at(-1).actorId, "u-super");
  assert.ok(connection.state.tx.includes("commit"));
});

test("a user cannot change their own roles", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin")],
  });
  await assert.rejects(
    () => assignRole(connection, "u-super", "admin", "u-super", "self"),
    /role miliknya sendiri/
  );
});

test("revoking a role records an audit entry", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin"), withRole("u-admin", "admin")],
  });
  await revokeRole(connection, "u-admin", "admin", "u-super", "demote");
  assert.equal(connection.state.audit.at(-1).action, "revoked");
  assert.equal(connection.state.audit.at(-1).actorId, "u-super");
  assert.deepEqual(await getUserRoles(connection, "u-admin"), ["player"]);
});

test("revoking a role that is not active is rejected without an audit entry", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin")],
  });
  await assert.rejects(
    () => revokeRole(connection, "u-player", "admin", "u-super", "demote"),
    /Role aktif tidak ditemukan/
  );
  assert.equal(connection.state.audit.length, 0);
  assert.ok(connection.state.tx.includes("rollback"));
});

test("an audit failure rolls the role change back", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin")],
    failAudit: true,
  });
  await assert.rejects(
    () => assignRole(connection, "u-player", "admin", "u-super", "promote"),
    /audit insert failed/
  );
  assert.equal(connection.state.assignments.filter((row) => row.userId === "u-player").length, 0);
  assert.ok(connection.state.tx.includes("rollback"));
  assert.ok(!connection.state.tx.includes("commit"));
});

test("a stale admin token loses access after the role is revoked", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin"), withRole("u-admin", "admin")],
  });
  const before = await getUserRoles(connection, "u-admin");
  assert.equal(hasRole(before, "admin"), true);

  await revokeRole(connection, "u-admin", "admin", "u-super", "demote");

  const after = await getUserRoles(connection, "u-admin");
  assert.equal(hasRole(after, "admin"), false);
  assert.equal(hasRole(after, "super_admin"), false);
});

test("the second super admin bootstrap is rejected", async () => {
  const connection = createFakeConnection({ users: ["u-1", "u-2"] });
  await bootstrapFirstSuperAdmin(connection, "u-1", "operator-secret", "operator-secret");
  assert.equal(connection.state.audit.at(-1).reason, "Initial operator bootstrap");

  await assert.rejects(
    () => bootstrapFirstSuperAdmin(connection, "u-2", "operator-secret", "operator-secret"),
    /Super Admin sudah tersedia/
  );
});

test("bootstrap rejects a wrong operator secret", async () => {
  const connection = createFakeConnection({ users: ["u-1"] });
  await assert.rejects(
    () => bootstrapFirstSuperAdmin(connection, "u-1", "wrong", "expected"),
    /Verifikasi operator ditolak/
  );
  assert.equal(connection.state.audit.length, 0);
});

test("bootstrap rejects a user that does not exist", async () => {
  const connection = createFakeConnection({ users: ["u-1"] });
  await assert.rejects(
    () => bootstrapFirstSuperAdmin(connection, "u-missing", "operator-secret", "operator-secret"),
    /belum terdaftar/
  );
});

test("a second super admin can revoke the first", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin"), withRole("u-super2", "super_admin")],
    users: ["u-super", "u-super2"],
  });
  await revokeRole(connection, "u-super", "super_admin", "u-super2", "rotate operator");
  assert.deepEqual(await getUserRoles(connection, "u-super"), ["player"]);
});

test("missing RBAC tables fail closed, never granting admin", async () => {
  const connection = createFakeConnection({ missingTables: true });
  const roles = await getUserRoles(connection, "u-admin");
  assert.deepEqual(roles, ["player"]);
  assert.equal(hasRole(roles, "admin"), false);
  assert.equal(hasRole(roles, "super_admin"), false);
});

test("privileged role changes acquire the global lock before reading state", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin")],
  });
  await assignRole(connection, "u-player", "admin", "u-super", "promote");

  const lockIndex = connection.state.ops.findIndex((q) =>
    q.startsWith("SELECT id FROM rbac_security_state")
  );
  const rolesIndex = connection.state.ops.findIndex((q) =>
    q.startsWith("SELECT roles.code FROM user_roles")
  );
  assert.ok(lockIndex >= 0, "lock query must run");
  assert.ok(rolesIndex > lockIndex, "lock must be taken before reading actor roles");
});

test("privileged changes are refused when the lock table is missing", async () => {
  const connection = createFakeConnection({
    assignments: [withRole("u-super", "super_admin")],
    missingLockTable: true,
  });
  await assert.rejects(
    () => assignRole(connection, "u-player", "admin", "u-super", "promote"),
    /doesn't exist/
  );
  assert.equal(connection.state.audit.length, 0);
});

test("two concurrent bootstraps: only one succeeds", async () => {
  const mutex = createMutex();
  const store = { assignments: [], audit: [] };
  const common = { users: ["u-1", "u-2"], mutex, sharedStore: store };

  const first = createFakeConnection(common);
  const second = createFakeConnection(common);

  const results = await Promise.allSettled([
    bootstrapFirstSuperAdmin(first, "u-1", "secret", "secret"),
    bootstrapFirstSuperAdmin(second, "u-2", "secret", "secret"),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /Super Admin sudah tersedia/);

  const activeSupers = store.assignments.filter(
    (row) => row.roleId === ROLES.super_admin && !row.revokedAt
  );
  assert.equal(activeSupers.length, 1);
  const bootstrapAudits = store.audit.filter(
    (row) => row.reason === "Initial operator bootstrap"
  );
  assert.equal(bootstrapAudits.length, 1);
});

test("two concurrent cross-revokes cannot remove every super admin", async () => {
  const mutex = createMutex();
  const store = {
    assignments: [withRole("u-super-a", "super_admin"), withRole("u-super-b", "super_admin")],
    audit: [],
  };
  const common = { users: ["u-super-a", "u-super-b"], mutex, sharedStore: store };

  const first = createFakeConnection(common);
  const second = createFakeConnection(common);

  const results = await Promise.allSettled([
    revokeRole(first, "u-super-b", "super_admin", "u-super-a", "cross revoke"),
    revokeRole(second, "u-super-a", "super_admin", "u-super-b", "cross revoke"),
  ]);

  const activeSupers = store.assignments.filter(
    (row) => row.roleId === ROLES.super_admin && !row.revokedAt
  );
  assert.ok(activeSupers.length >= 1, "at least one super admin must remain");

  const successes = results.filter((r) => r.status === "fulfilled").length;
  const revokeAudits = store.audit.filter((row) => row.action === "revoked").length;
  assert.equal(revokeAudits, successes, "only successful revokes may write audit");
});
