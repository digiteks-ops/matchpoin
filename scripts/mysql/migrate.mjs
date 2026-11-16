import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertMySql8, connectToMySql } from "./db.mjs";

const migrationDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "mysql",
  "migrations"
);

async function listMigrations() {
  try {
    const files = await readdir(migrationDirectory);
    return files
      .filter((file) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(file))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const connection = await connectToMySql({ multipleStatements: true });

  try {
    const version = await assertMySql8(connection);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS matchpoin_schema_migrations (
        name VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    const [appliedRows] = await connection.query(
      "SELECT name, checksum FROM matchpoin_schema_migrations"
    );
    const applied = new Map(appliedRows.map((row) => [row.name, row.checksum]));
    const migrations = await listMigrations();
    let appliedCount = 0;

    for (const name of migrations) {
      const sql = await readFile(resolve(migrationDirectory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previousChecksum = applied.get(name);

      if (previousChecksum) {
        if (previousChecksum !== checksum) {
          throw new Error(
            `Applied migration ${name} has changed. Restore it or create a new forward migration.`
          );
        }
        continue;
      }

      console.log(`Applying ${name}...`);
      await connection.query(sql);
      await connection.execute(
        "INSERT INTO matchpoin_schema_migrations (name, checksum) VALUES (?, ?)",
        [name, checksum]
      );
      appliedCount += 1;
    }

    console.log(
      appliedCount === 0
        ? `MySQL ${version} is ready; no pending application migrations.`
        : `Applied ${appliedCount} migration(s) to MySQL ${version}.`
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`MySQL migration failed: ${error.message}`);
  process.exitCode = 1;
});
