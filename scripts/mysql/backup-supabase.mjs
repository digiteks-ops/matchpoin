import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function getSourceConnection() {
  const sourceUrl = process.env.SUPABASE_DB_URL;
  if (!sourceUrl) {
    throw new Error("SUPABASE_DB_URL is not set. Add the direct PostgreSQL URL to .env.local.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("SUPABASE_DB_URL is not a valid PostgreSQL connection URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.pathname.length < 2 ||
    !parsedUrl.username ||
    !parsedUrl.password
  ) {
    throw new Error("SUPABASE_DB_URL must include a PostgreSQL host, database, username, and password.");
  }

  const sslMode = parsedUrl.searchParams.get("sslmode") || "require";
  if (!["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("SUPABASE_DB_URL must use sslmode=require, verify-ca, or verify-full.");
  }

  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port || "5432",
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.slice(1)),
    sslMode,
  };
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
    (pathFromRepository !== ".." &&
      !pathFromRepository.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRepository))
  ) {
    throw new Error("MATCHPOIN_BACKUP_DIR must be outside the repository.");
  }

  return directory;
}

async function runClientTool(command, args, env) {
  try {
    return await execFileAsync(command, args, {
      env,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${command} is unavailable. Install PostgreSQL client tools and add them to PATH.`);
    }
    const details = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} failed with exit code ${error.code ?? "unknown"}: ${details}`);
  }
}

async function ensureNotExists(path) {
  try {
    await access(path);
    throw new Error(`Refusing to overwrite existing backup: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function main() {
  const source = getSourceConnection();
  const backupDirectory = getBackupDirectory();
  await mkdir(backupDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDirectory, `matchpoin-supabase-${timestamp}.dump`);
  const temporaryPath = `${backupPath}.${randomUUID()}.partial`;
  const checksumPath = `${backupPath}.sha256`;
  const temporaryChecksumPath = `${checksumPath}.${randomUUID()}.partial`;
  await ensureNotExists(backupPath);
  await ensureNotExists(checksumPath);

  const childEnv = {
    ...process.env,
    PGHOST: source.host,
    PGPORT: source.port,
    PGUSER: source.user,
    PGPASSWORD: source.password,
    PGDATABASE: source.database,
    PGSSLMODE: source.sslMode,
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "matchpoin-supabase-backup",
  };

  try {
    await runClientTool("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${temporaryPath}`], childEnv);

    const backupStat = await stat(temporaryPath);
    if (backupStat.size === 0) {
      throw new Error("pg_dump produced an empty archive.");
    }

    const { stdout } = await runClientTool("pg_restore", ["--list", temporaryPath], childEnv);
    if (!stdout.trim()) {
      throw new Error("pg_restore could not read the backup archive.");
    }

    const checksum = await sha256File(temporaryPath);
    await writeFile(temporaryChecksumPath, `${checksum}  ${backupPath.split(/[\\/]/).pop()}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, backupPath);
    await rename(temporaryChecksumPath, checksumPath);

    console.log(`Verified PostgreSQL archive created: ${backupPath}`);
    console.log(`SHA-256 checksum saved: ${checksumPath}`);
    console.log("A separate restore drill and Supabase Storage backup are still required.");
  } catch (error) {
    await rm(temporaryPath, { force: true });
    await rm(temporaryChecksumPath, { force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(`Supabase backup failed: ${error.message}`);
  process.exitCode = 1;
});
