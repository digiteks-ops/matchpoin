/**
 * MATCHPOIN — MySQL → Supabase data restoration (backup-first, non-destructive).
 *
 * The MySQL database was created as a fresh-start copy of Supabase, so most rows
 * already exist in Supabase. This tool only copies rows that are missing there:
 *   * every run writes a full JSON backup of MySQL BEFORE touching Supabase
 *   * imports use upsert(..., { ignoreDuplicates: true }) — never update/delete
 *   * user IDs are remapped to Supabase Auth IDs, roles/cities/courts are matched
 *     by natural key so no duplicate reference rows are created
 *   * validates row counts and foreign-key integrity after the import
 *
 * Usage (requires DATABASE_URL + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * and MATCHPOIN_BACKUP_DIR pointing outside the repository):
 *   npm run db:restore-mysql            # backup + import + validate
 *   npm run db:restore-mysql -- --backup-only
 *   npm run db:restore-mysql -- --validate-only
 */
import { createHash } from "node:crypto";import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { connectToMySql } from "../../src/lib/mysql/db.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Deterministic UUID for legacy slug identifiers (e.g. `ika17-mens-singles`). */
function uuidFromString(value) {
  const hash = createHash("sha1").update(`matchpoin:${value}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const DATE_COLUMNS = new Set([
  "match_date",
  "start_date",
  "end_date",
  "registration_deadline",
  "date_of_birth",
]);

const BOOLEAN_COLUMNS = new Set([
  "is_active",
  "is_verified",
  "is_profile_public",
  "show_rating",
  "show_history",
  "show_online_status",
  "allow_invites",
  "is_verified_player",
  "is_private",
  "is_organizer",
  "is_league",
  "is_system",
  "is_read",
  "needs_tiebreak",
  "is_walkover",
  "is_league_challenge",
]);

/**
 * Import order respects foreign keys. `columns` lists the Supabase columns that
 * are copied verbatim from MySQL; `renames` maps MySQL → Supabase column names.
 * `userColumns` lists columns that hold a user id and must be remapped to the
 * Supabase Auth id.
 */
const TABLES = [
  {
    name: "cities",
    columns: ["id", "name", "province", "latitude", "longitude", "is_active", "sort_order", "created_at", "updated_at"],
    naturalKey: (row) => row.name?.trim().toLowerCase(),
  },
  {
    name: "tennis_courts",
    columns: ["id", "name", "city_id", "address", "court_type", "number_of_courts", "environment", "status", "is_active", "created_at", "updated_at"],
    cityColumns: ["city_id"],
    naturalKey: (row) => `${row.name?.trim().toLowerCase()}|${row.city_id}`,
  },
  {
    name: "users",
    columns: ["id", "phone", "email", "full_name", "avatar_url", "date_of_birth", "gender", "city_id", "timezone", "locale", "is_verified", "auth_session_version", "created_at", "updated_at"],
    idFrom: (row) => row.auth_user_id || row.id,
    cityColumns: ["city_id"],
  },
  {
    name: "player_profiles",
    columns: ["id", "user_id", "display_name", "bio", "playing_since", "preferred_hand", "backhand", "preferred_court_id", "play_frequency", "preferred_categories", "preferred_times", "self_assessed_level", "ntrp_rating", "itf_wtn", "usta_rating", "is_profile_public", "profile_visibility", "show_rating", "show_history", "show_online_status", "allow_invites", "completion_score", "is_verified_player", "created_at", "updated_at"],
    userColumns: ["user_id"],
    courtColumns: ["preferred_court_id"],
  },
  {
    name: "player_ratings",
    columns: ["id", "user_id", "current_rating", "peak_rating", "matches_played", "wins", "losses", "draws", "win_streak", "best_win_streak", "current_streak_type", "last_match_at", "last_rating_change_at", "rating_algorithm_version", "created_at", "updated_at"],
    userColumns: ["user_id"],
  },
  {
    name: "matches",
    columns: ["id", "title", "description", "court_id", "organizer_id", "match_date", "start_time", "duration_minutes", "status", "is_private", "metadata", "created_at", "updated_at"],
    renames: { max_players: "max_participants", current_players: "current_participants" },
    userColumns: ["organizer_id"],
    courtColumns: ["court_id"],
    transform(row) {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      return {
        category: metadata.category ?? "mens_singles",
        match_type: metadata.match_type ?? "friendly",
        court_name: metadata.court_name ?? null,
        city_name: metadata.court_city ?? null,
        address: metadata.court_address ?? null,
      };
    },
  },
  {
    name: "match_participants",
    columns: ["id", "match_id", "user_id", "is_organizer", "team", "metadata", "joined_at", "confirmed_at", "left_at"],
    userColumns: ["user_id"],
  },
  {
    name: "match_results",
    columns: ["id", "match_id", "team1_score", "team2_score", "winner_team", "submitted_by", "status", "submitted_at", "confirmed_at", "disputed_at", "is_walkover", "walkover_by", "walkover_reason", "metadata", "created_at", "updated_at"],
    userColumns: ["submitted_by", "walkover_by"],
  },
  {
    name: "rating_history",
    columns: ["id", "user_id", "match_id", "old_rating", "new_rating", "rating_change", "change_reason", "match_result", "opponent_id", "opponent_rating", "algorithm_version", "created_at"],
    userColumns: ["user_id", "opponent_id"],
  },
  {
    name: "tournaments",
    columns: ["id", "name", "description", "category", "season", "start_date", "end_date", "registration_deadline", "status", "max_participants", "organizer_id", "city_id", "is_league", "created_at", "updated_at"],
    userColumns: ["organizer_id"],
    cityColumns: ["city_id"],
    idFrom: (row) => (isUuid(row.id) ? row.id : uuidFromString(row.id)),
    transform(row) {
      return isUuid(row.id) ? {} : { slug: row.id };
    },
  },
  {
    name: "tournament_participants",
    columns: ["id", "tournament_id", "user_id", "category", "entry_id", "entry_role", "partner_user_id", "status", "joined_at"],
    userColumns: ["user_id", "partner_user_id"],
    tournamentColumns: ["tournament_id"],
  },
  {
    name: "league_standings",
    columns: ["id", "tournament_id", "category", "entry_id", "position", "played", "won", "lost", "wo_won", "wo_lost", "games_won", "games_lost", "game_diff", "points", "needs_tiebreak", "updated_at"],
    tournamentColumns: ["tournament_id"],
  },
  {
    name: "roles",
    columns: ["id", "code", "name", "is_system", "created_at", "updated_at"],
    naturalKey: (row) => row.code,
  },
  {
    name: "user_roles",
    columns: ["id", "user_id", "role_id", "assigned_by", "assigned_at", "revoked_by", "revoked_at", "reason"],
    userColumns: ["user_id", "assigned_by", "revoked_by"],
    roleColumns: ["role_id"],
  },
  {
    name: "role_audit_logs",
    columns: ["id", "user_id", "role_id", "action", "actor_id", "reason", "created_at"],
    userColumns: ["user_id", "actor_id"],
    roleColumns: ["role_id"],
  },
  {
    name: "notifications",
    columns: ["id", "user_id", "type", "title", "message", "data", "reference_id", "is_read", "created_at"],
    userColumns: ["user_id"],
  },
  {
    name: "file_metadata",
    columns: ["id", "user_id", "storage_key", "bucket", "original_name", "content_type", "size_bytes", "kind", "reference_id", "verified_at", "verified_by", "created_at"],
    userColumns: ["user_id", "verified_by"],
  },
  {
    name: "tournament_registration_audit_logs",
    columns: ["id", "registration_id", "tournament_id", "action", "actor_id", "previous_status", "new_status", "reason", "created_at"],
    userColumns: ["actor_id"],
    tournamentColumns: ["tournament_id"],
  },
];

function readFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getBackupDirectory() {
  const value = process.env.MATCHPOIN_BACKUP_DIR;
  if (!value || !isAbsolute(value)) {
    throw new Error("MATCHPOIN_BACKUP_DIR must be an absolute path outside the repository.");
  }
  const directory = resolve(value);
  const pathFromRepository = relative(repositoryRoot, directory);
  if (
    pathFromRepository === "" ||
    (pathFromRepository !== ".." && !pathFromRepository.startsWith(`..${sep}`) && !isAbsolute(pathFromRepository))
  ) {
    throw new Error("MATCHPOIN_BACKUP_DIR must be outside the repository.");
  }
  return directory;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeValue(column, value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (DATE_COLUMNS.has(column)) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return value.toISOString();
  }
  if (BOOLEAN_COLUMNS.has(column)) return Boolean(value);
  if (typeof value === "string" && DATE_COLUMNS.has(column)) return value.slice(0, 10);
  return value;
}

function mapRow(table, row, context) {
  const mapped = {};
  for (const column of table.columns) {
    if (column in row) mapped[column] = normalizeValue(column, row[column]);
  }
  for (const [source, target] of Object.entries(table.renames ?? {})) {
    if (source in row) mapped[target] = normalizeValue(target, row[source]);
  }
  if (table.idFrom) mapped.id = table.idFrom(row);
  for (const column of table.userColumns ?? []) {
    if (mapped[column]) mapped[column] = context.userIdMap.get(mapped[column]) ?? mapped[column];
  }
  for (const column of table.roleColumns ?? []) {
    if (mapped[column]) mapped[column] = context.roleIdMap.get(mapped[column]) ?? mapped[column];
  }
  for (const column of table.cityColumns ?? []) {
    if (mapped[column]) mapped[column] = context.cityIdMap.get(mapped[column]) ?? mapped[column];
  }
  for (const column of table.courtColumns ?? []) {
    if (mapped[column]) mapped[column] = context.courtIdMap.get(mapped[column]) ?? mapped[column];
  }
  for (const column of table.tournamentColumns ?? []) {
    if (mapped[column]) mapped[column] = context.tournamentIdMap.get(mapped[column]) ?? mapped[column];
  }
  if (table.transform) Object.assign(mapped, table.transform(row));
  return mapped;
}

async function fetchIdMap(supabase, table, select, key) {
  const { data, error } = await supabase.from(table).select(select);
  if (error) throw new Error(`Load ${table} failed: ${error.message}`);
  const map = new Map();
  for (const row of data ?? []) map.set(key(row), row.id);
  return map;
}

/**
 * Builds every id remap up front:
 *   * MySQL user id      → Supabase Auth id (users.auth_user_id || users.id)
 *   * MySQL role id      → Supabase role id   (matched by role code)
 *   * MySQL city id      → Supabase city id   (matched by city name)
 *   * MySQL court id     → Supabase court id  (matched by name + mapped city)
 * Rows with no Supabase counterpart keep their MySQL id, so they are inserted
 * with the same id and never duplicated.
 */
async function buildContext(supabase, users, mysqlRoles, mysqlCities, mysqlCourts, mysqlTournaments) {
  const { data: roles, error: roleError } = await supabase.from("roles").select("id, code");
  if (roleError) throw new Error(`Load roles failed: ${roleError.message}`);
  const roleIdByCode = new Map((roles ?? []).map((role) => [role.code, role.id]));

  const { data: cities, error: cityError } = await supabase.from("cities").select("id, name");
  if (cityError) throw new Error(`Load cities failed: ${cityError.message}`);
  const cityIdByName = new Map((cities ?? []).map((city) => [city.name.trim().toLowerCase(), city.id]));

  const { data: courts, error: courtError } = await supabase.from("tennis_courts").select("id, name, city_id");
  if (courtError) throw new Error(`Load tennis_courts failed: ${courtError.message}`);
  const courtKey = (name, cityId) => `${(name ?? "").trim().toLowerCase()}|${cityId ?? ""}`;
  const courtIdByKey = new Map((courts ?? []).map((court) => [courtKey(court.name, court.city_id), court.id]));

  const userIdMap = new Map(users.map((user) => [user.id, user.auth_user_id || user.id]));

  const roleIdMap = new Map();
  const mysqlRoleCodeById = new Map(mysqlRoles.map((role) => [role.id, role.code]));
  for (const [oldId, code] of mysqlRoleCodeById) {
    const target = roleIdByCode.get(code);
    if (target) roleIdMap.set(oldId, target);
  }

  const cityIdMap = new Map();
  const mysqlCityNameById = new Map(mysqlCities.map((city) => [city.id, city.name]));
  for (const [oldId, name] of mysqlCityNameById) {
    const target = cityIdByName.get(String(name ?? "").trim().toLowerCase());
    if (target) cityIdMap.set(oldId, target);
  }

  const courtIdMap = new Map();
  for (const court of mysqlCourts) {
    const mappedCity = cityIdMap.get(court.city_id) ?? court.city_id;
    const target = courtIdByKey.get(courtKey(court.name, mappedCity));
    if (target) courtIdMap.set(court.id, target);
  }

  const tournamentIdMap = new Map(
    mysqlTournaments.map((tournament) => [
      tournament.id,
      isUuid(tournament.id) ? tournament.id : uuidFromString(tournament.id),
    ])
  );

  return {
    userIdMap,
    roleIdMap,
    roleIdByCode,
    cityIdMap,
    cityIdByName,
    courtIdMap,
    courtIdByKey,
    courtKey,
    tournamentIdMap,
  };
}

async function tableExists(connection, name) {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name]
  );
  return Number(rows[0]?.total ?? 0) > 0;
}

async function backupMysql(connection, directory) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = join(directory, `matchpoin-mysql-${stamp}`);
  await mkdir(backupRoot, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), tables: {} };

  for (const table of TABLES) {
    if (!(await tableExists(connection, table.name))) {
      manifest.tables[table.name] = { rows: 0, skipped: true };
      continue;
    }
    const [rows] = await connection.query(`SELECT * FROM \`${table.name}\``);
    const payload = JSON.stringify(rows, null, 2);
    const file = join(backupRoot, `${table.name}.json`);
    await writeFile(file, payload, { flag: "wx" });
    manifest.tables[table.name] = {
      rows: rows.length,
      sha256: createHash("sha256").update(payload).digest("hex"),
    };
  }

  await writeFile(join(backupRoot, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  console.log(`MySQL backup written: ${backupRoot}`);
  return { backupRoot, manifest };
}

async function latestBackup(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("matchpoin-mysql-"))
    .map((entry) => entry.name)
    .sort();
  if (candidates.length === 0) throw new Error("No MySQL backup found. Run without --validate-only first.");
  return join(directory, candidates[candidates.length - 1]);
}

async function readBackupTable(backupRoot, name) {
  try {
    return JSON.parse(await readFile(join(backupRoot, `${name}.json`), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function importTable(supabase, table, mapped) {
  if (mapped.length === 0) return { imported: 0, skippedDuplicates: 0 };

  let inserted = 0;
  let skippedDuplicates = 0;
  for (let index = 0; index < mapped.length; index += 200) {
    const chunk = mapped.slice(index, index + 200);
    const { error } = await supabase
      .from(table.name)
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
    if (!error) {
      inserted += chunk.length;
      continue;
    }
    if (error.code !== "23505" && !/duplicate key/i.test(error.message)) {
      throw new Error(`Import ${table.name} failed: ${error.message}`);
    }
    // A natural-key unique constraint (user_id, entry_id, ...) conflicted.
    // Fall back to row-by-row so one existing row cannot block the chunk.
    for (const row of chunk) {
      const { error: rowError } = await supabase
        .from(table.name)
        .upsert([row], { onConflict: "id", ignoreDuplicates: true });
      if (!rowError) inserted += 1;
      else if (rowError.code === "23505" || /duplicate key/i.test(rowError.message)) skippedDuplicates += 1;
      else throw new Error(`Import ${table.name} row ${row.id} failed: ${rowError.message}`);
    }
  }
  return { imported: inserted, skippedDuplicates };
}

async function importBackup(supabase, backupRoot) {
  const summary = {};

  // Reference maps are built from the backup itself; Supabase is the target.
  const mysqlUsers = (await readBackupTable(backupRoot, "users")) ?? [];
  const mysqlRoles = (await readBackupTable(backupRoot, "roles")) ?? [];
  const mysqlCities = (await readBackupTable(backupRoot, "cities")) ?? [];
  const mysqlCourts = (await readBackupTable(backupRoot, "tennis_courts")) ?? [];
  const mysqlTournaments = (await readBackupTable(backupRoot, "tournaments")) ?? [];
  const context = await buildContext(
    supabase,
    mysqlUsers,
    mysqlRoles,
    mysqlCities,
    mysqlCourts,
    mysqlTournaments
  );

  for (const table of TABLES) {
    const rows = await readBackupTable(backupRoot, table.name);
    if (!rows) {
      summary[table.name] = { imported: 0, skipped: true };
      continue;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      summary[table.name] = { imported: 0, source: 0 };
      continue;
    }

    let mapped;
    if (table.name === "cities") {
      mapped = rows
        .filter((row) => !context.cityIdByName.has(String(row.name ?? "").trim().toLowerCase()))
        .map((row) => mapRow(table, row, context));
    } else if (table.name === "roles") {
      mapped = rows
        .filter((row) => !context.roleIdByCode.has(row.code))
        .map((row) => mapRow(table, row, context));
    } else if (table.name === "tennis_courts") {
      mapped = rows
        .filter((row) => !context.courtIdByKey.has(context.courtKey(row.name, row.city_id)))
        .map((row) => mapRow(table, row, context));
    } else {
      mapped = rows.map((row) => mapRow(table, row, context));
    }

    const result = await importTable(supabase, table, mapped);
    summary[table.name] = { ...result, source: rows.length };
    console.log(
      `Imported ${table.name}: ${result.imported}/${rows.length} row(s) ` +
        `(${result.skippedDuplicates} duplicate(s) ignored).`
    );
  }
  return summary;
}

async function countSupabase(supabase, table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`Count ${table} failed: ${error.message}`);
  return count ?? 0;
}

async function validate(supabase, backupRoot) {
  const report = { tables: {}, orphans: [], missing: [], ok: true };
  const users = (await readBackupTable(backupRoot, "users")) ?? [];
  const userIdMap = new Map(users.map((user) => [user.id, user.auth_user_id || user.id]));

  for (const table of TABLES) {
    const sourceRows = await readBackupTable(backupRoot, table.name);
    if (!sourceRows) continue;
    const supabaseCount = await countSupabase(supabase, table.name);
    const ids = sourceRows
      .map((row) => (table.idFrom ? table.idFrom(row) : row.id))
      .filter(Boolean);
    let present = 0;
    const missingIds = [];
    for (let index = 0; index < ids.length; index += 200) {
      const chunk = ids.slice(index, index + 200);
      const { data, error } = await supabase.from(table.name).select("id").in("id", chunk);
      if (error) throw new Error(`Validate ${table.name} failed: ${error.message}`);
      const found = new Set((data ?? []).map((row) => row.id));
      present += found.size;
      missingIds.push(...chunk.filter((id) => !found.has(id)));
    }
    report.tables[table.name] = { mysql: ids.length, supabase: supabaseCount, missing: missingIds.length };
    if (missingIds.length > 0) {
      report.ok = false;
      report.missing.push({ table: table.name, count: missingIds.length, sample: missingIds.slice(0, 5) });
    }
  }

  const checks = [
    { table: "player_profiles", column: "user_id", parent: "users", remap: true },
    { table: "player_ratings", column: "user_id", parent: "users", remap: true },
    { table: "matches", column: "organizer_id", parent: "users", remap: true },
    { table: "match_participants", column: "match_id", parent: "matches" },
    { table: "match_participants", column: "user_id", parent: "users", remap: true },
    { table: "match_results", column: "match_id", parent: "matches" },
    { table: "tournament_participants", column: "tournament_id", parent: "tournaments" },
    { table: "tournament_participants", column: "user_id", parent: "users", remap: true },
    { table: "user_roles", column: "user_id", parent: "users", remap: true },
    { table: "user_roles", column: "role_id", parent: "roles" },
    { table: "notifications", column: "user_id", parent: "users", remap: true },
  ];

  for (const check of checks) {
    const { data: children, error } = await supabase.from(check.table).select(check.column).limit(5000);
    if (error) throw new Error(`Orphan scan ${check.table} failed: ${error.message}`);
    const childIds = Array.from(
      new Set(
        (children ?? [])
          .map((row) => (check.remap ? userIdMap.get(row[check.column]) ?? row[check.column] : row[check.column]))
          .filter(Boolean)
      )
    );
    if (childIds.length === 0) continue;
    const { data: parents, error: parentError } = await supabase.from(check.parent).select("id").in("id", childIds);
    if (parentError) throw new Error(`Orphan scan ${check.parent} failed: ${parentError.message}`);
    const parentIds = new Set((parents ?? []).map((row) => row.id));
    const orphans = childIds.filter((id) => !parentIds.has(id));
    if (orphans.length > 0) {
      report.ok = false;
      report.orphans.push({ table: check.table, column: check.column, count: orphans.length, sample: orphans.slice(0, 5) });
    }
  }

  const validationPath = join(backupRoot, `validation-${Date.now()}.json`);
  await writeFile(validationPath, JSON.stringify(report, null, 2));
  console.log(`Validation report: ${validationPath}`);
  console.log(JSON.stringify(report.tables, null, 2));
  if (!report.ok) {
    console.error("Validation FAILED: missing rows or orphaned relations detected.");
    process.exitCode = 1;
  } else {
    console.log("Validation passed: all MySQL rows exist in Supabase and relations are intact.");
  }
  return report;
}

async function main() {
  const directory = getBackupDirectory();
  await mkdir(directory, { recursive: true });
  const supabase = getSupabaseAdmin();

  if (readFlag("validate-only")) {
    const backupRoot = await latestBackup(directory);
    await validate(supabase, backupRoot);
    return;
  }

  const connection = await connectToMySql();
  let backupRoot;
  try {
    const backup = await backupMysql(connection, directory);
    backupRoot = backup.backupRoot;
  } finally {
    await connection.end();
  }

  if (readFlag("backup-only")) return;

  await importBackup(supabase, backupRoot);
  await validate(supabase, backupRoot);
}

main().catch((error) => {
  console.error(`MySQL → Supabase restoration failed: ${error.message}`);
  process.exitCode = 1;
});
