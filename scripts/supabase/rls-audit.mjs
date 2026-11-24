/**
 * Static audit of the MATCHPOIN Supabase migrations and admin guards.
 *
 * Reads supabase/migrations/*.sql in order (last definition wins) and reports:
 *   - tables without ENABLE ROW LEVEL SECURITY
 *   - duplicate policy names per table
 *   - policies using bare auth.uid() instead of (select auth.uid())
 *   - SECURITY DEFINER functions without `set search_path = public`
 *   - storage.objects write policies that do not pin auth.uid()
 *   - admin_reject_registration signature/defaults vs the admin UI call
 *   - admin pages / API routes / middleware guard coverage
 *
 * Offline only. No database connection. Exit code 1 when a FAIL is found.
 *
 * Usage: node scripts/supabase/rls-audit.mjs [--json]
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(root, "supabase/migrations");

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const tables = new Map(); // name -> { rls: boolean, file }
const policies = new Map(); // `${table}.${policy}` -> { table, policy, file, body, duplicate }
const policyNames = new Map(); // `${table}.${policy}` -> count
const definerFunctions = new Map(); // signature -> { file, searchPath }
const rejectSignatures = [];
const findings = [];

function add(severity, rule, detail, file) {
  findings.push({ severity, rule, detail, file: file ?? "" });
}

/** Extract a statement starting at `start` up to the first `;` at depth 0. */
function statementAt(sql, start) {
  let depth = 0;
  for (let i = start; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) return sql.slice(start, i + 1);
  }
  return sql.slice(start);
}

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  const upper = sql.toUpperCase();

  // Komentar tidak boleh dianggap SQL: migrasi 00024 memuat contoh manual
  // `CREATE TABLE ... matches_status_backup` di dalam komentar, yang dulu
  // dilaporkan sebagai tabel tanpa RLS padahal tabelnya tidak pernah dibuat.
  const structural = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

  // Tables
  for (const match of structural.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
    const name = match[1].toLowerCase();
    if (!tables.has(name)) tables.set(name, { rls: false, file });
  }

  // RLS enable
  for (const match of structural.matchAll(/ALTER\s+TABLE\s+public\.([a-z_][a-z0-9_]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)) {
    const name = match[1].toLowerCase();
    const entry = tables.get(name) ?? { rls: false, file };
    entry.rls = true;
    tables.set(name, entry);
  }

  // Policies on public tables and storage.objects
  for (const match of sql.matchAll(/CREATE\s+POLICY\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ON\s+(public|storage)\.([a-z_][a-z0-9_]*)/gi)) {
    const policy = (match[1] ?? match[2]).toLowerCase();
    const schema = match[3].toLowerCase();
    const table = match[4].toLowerCase();
    const key = `${schema}.${table}.${policy}`;
    const body = statementAt(sql, match.index);
    const previous = policies.get(key);
    policies.set(key, {
      schema,
      table,
      policy,
      file,
      body,
      duplicate: Boolean(previous),
    });
    policyNames.set(key, (policyNames.get(key) ?? 0) + 1);
  }

  // SECURITY DEFINER functions
  for (const match of sql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
    const name = match[1].toLowerCase();
    const args = match[2].replace(/\s+/g, " ").trim();
    const body = statementAt(sql, match.index);
    if (!/SECURITY\s+DEFINER/i.test(body)) continue;
    const signature = `${name}(${args})`;
    definerFunctions.set(signature, {
      file,
      name,
      args,
      searchPath: /SET\s+search_path\s*=\s*(public|'public')/i.test(body),
      hasPublic: /\bpublic\b/i.test(
        body.match(/SET\s+search_path\s*=\s*([^\n;]+)/i)?.[1] ?? ""
      ),
    });
    if (name === "admin_reject_registration") {
      rejectSignatures.push({
        file,
        args,
        hasDefault: /p_reason\s+TEXT\s+DEFAULT/i.test(args),
      });
    }
  }

  // users.role written from a policy or trigger without a guard
  if (/CREATE\s+POLICY[\s\S]*?UPDATE\s*\(role\)/i.test(sql)) {
    add("FAIL", "role-escalation", "policy touches users.role", file);
  }
}

// --- Rules -----------------------------------------------------------------

for (const [name, entry] of tables) {
  if (!entry.rls) {
    add("FAIL", "rls-missing", `public.${name} has no ENABLE ROW LEVEL SECURITY`, entry.file);
  }
}

for (const [key, count] of policyNames) {
  if (count > 1) {
    add("INFO", "policy-duplicate", `${key} is created ${count} times (last wins)`, policies.get(key)?.file);
  }
}

for (const [key, entry] of policies) {
  const bare = (entry.body.match(/auth\.uid\(\)/gi) ?? []).length;
  const wrapped = (entry.body.match(/\(\s*SELECT\s+auth\.uid\(\)\s*\)/gi) ?? []).length;
  if (bare - wrapped > 0) {
    add(
      "WARN",
      "auth-uid-per-row",
      `${key} uses ${bare - wrapped} bare auth.uid() call(s)`,
      entry.file
    );
  }

  if (entry.schema === "storage" && entry.table === "objects") {
    const writes = /FOR\s+(INSERT|UPDATE|DELETE|ALL)/i.test(entry.body);
    const publicRead = /FOR\s+SELECT/i.test(entry.body) && /bucket_id\s*=\s*'[a-z-]+'/i.test(entry.body);
    if (writes && !/auth\.uid\(\)/i.test(entry.body)) {
      add("FAIL", "storage-write", `${key} allows writes without pinning auth.uid()`, entry.file);
    }
    if (!writes && !publicRead) {
      add("WARN", "storage-policy", `${key} is neither a scoped read nor a write policy`, entry.file);
    }
  }
}

for (const [signature, entry] of definerFunctions) {
  if (!entry.searchPath) {
    add("FAIL", "definer-search-path", `${signature} is SECURITY DEFINER without SET search_path = public`, entry.file);
  }
}

// admin_reject_registration: the admin UI calls rpc(..., { p_reason }) and the
// service passes null when no reason is given, so the latest definition must
// accept a missing/null reason.
const latestReject = rejectSignatures.at(-1);
if (!latestReject) {
  add("FAIL", "reject-signature", "admin_reject_registration is not defined", "");
} else if (!latestReject.hasDefault) {
  add(
    "FAIL",
    "reject-signature",
    "latest admin_reject_registration(p_reason TEXT) has no DEFAULT; the admin UI may omit the reason",
    latestReject.file
  );
}

// --- Admin guards ----------------------------------------------------------

async function walk(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(rel)));
    else result.push(rel);
  }
  return result;
}

const appFiles = await walk("src/app");
const adminPages = appFiles.filter((file) => file.startsWith("src/app/admin/") && file.endsWith("page.tsx"));
for (const page of adminPages) {
  const source = await readFile(path.join(root, page), "utf8");
if (!/requirePageRole\(\s*["'](?:admin|super_admin)["']/.test(source)) {
    add("FAIL", "admin-page-guard", `${page} has no requirePageRole admin guard`, page);
  }
}

const adminApiRoutes = appFiles.filter(
  (file) => file.startsWith("src/app/api/admin/") && file.endsWith("route.ts")
);
for (const route of adminApiRoutes) {
  const source = await readFile(path.join(root, route), "utf8");
if (!/requireApiRole\(\s*["'](?:admin|super_admin)["']/.test(source)) {
    add("FAIL", "admin-api-guard", `${route} has no requireApiRole admin guard`, route);
  }
}

const middleware = await readFile(path.join(root, "src/middleware.ts"), "utf8");
const supabaseMiddleware = await readFile(path.join(root, "src/lib/supabase/middleware.ts"), "utf8");
if (!/isProtectedAppPath/.test(middleware) && !/isProtectedAppPath/.test(supabaseMiddleware)) {
  add("FAIL", "middleware", "middleware does not call isProtectedAppPath", "src/middleware.ts");
}

const protectedRoutes = await readFile(path.join(root, "src/lib/auth/protected-routes.mjs"), "utf8");
if (!/["']\/admin["']/.test(protectedRoutes)) {
  add("FAIL", "middleware", "protected-routes.mjs does not include /admin", "src/lib/auth/protected-routes.mjs");
}

// --- Report ----------------------------------------------------------------

const counts = findings.reduce(
  (acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] ?? 0) + 1 }),
  {}
);

const summary = {
  migrations: files.length,
  tables: tables.size,
  tablesWithoutRls: [...tables].filter(([, entry]) => !entry.rls).map(([name]) => name),
  definerFunctions: definerFunctions.size,
  policies: policies.size,
  adminPages: adminPages.length,
  adminApiRoutes: adminApiRoutes.length,
  counts,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else {
  console.log(
    `RLS audit â€” ${files.length} migrations, ${tables.size} tables, ${policies.size} policies, ` +
      `${definerFunctions.size} definer functions, ${adminPages.length} admin pages, ` +
      `${adminApiRoutes.length} admin API routes`
  );
  console.log(`FAIL: ${counts.FAIL ?? 0}  WARN: ${counts.WARN ?? 0}  INFO: ${counts.INFO ?? 0}\n`);
  for (const item of findings) {
    console.log(`${item.severity.padEnd(4)} ${item.rule.padEnd(22)} ${item.detail}`);
  }
}

process.exit(counts.FAIL ? 1 : 0);

