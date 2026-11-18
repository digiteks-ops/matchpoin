/**
 * One-time Super Admin bootstrap (server-side operator procedure).
 *
 * It never creates accounts and is not reachable over HTTP.
 *
 * Usage:
 *   1. Set MATCHPOIN_BOOTSTRAP_SECRET in .env.local (long random value,
 *      used only for this run; never committed, never read by the app).
 *   2. Run:
 *        npm run db:bootstrap-super-admin -- --email=operator@example.com --confirm
 *   3. Type the same secret when prompted.
 *
 * The procedure is refused when a Super Admin already exists.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { connectToMySql } from "../../src/lib/mysql/db.mjs";
import { bootstrapFirstSuperAdmin } from "../../src/lib/mysql/rbac-core.mjs";

function readFlag(name) {
  const prefix = `--${name}=`;
  const withValue = process.argv.find((arg) => arg.startsWith(prefix));
  if (withValue) return withValue.slice(prefix.length);
  return process.argv.includes(`--${name}`) ? true : undefined;
}

async function resolveUserId(connection, userId, email) {
  if (typeof userId === "string" && userId.trim()) return userId.trim();
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Provide --user-id=<uuid> or --email=<address>.");
  }
  const [rows] = await connection.execute(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email.trim().toLowerCase()]
  );
  if (!rows[0]) throw new Error("No user found for that email.");
  return rows[0].id;
}

async function main() {
  const expectedSecret = process.env.MATCHPOIN_BOOTSTRAP_SECRET;
  if (!expectedSecret) {
    throw new Error(
      "MATCHPOIN_BOOTSTRAP_SECRET is not set. Set it in .env.local for this one-time run."
    );
  }
  if (readFlag("confirm") !== true) {
    throw new Error("Refusing to run without --confirm.");
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let operatorSecret;
  try {
    operatorSecret = (await rl.question("Operator secret: ")).trim();
  } finally {
    rl.close();
  }

  const connection = await connectToMySql();
  try {
    const userId = await resolveUserId(connection, readFlag("user-id"), readFlag("email"));
    await bootstrapFirstSuperAdmin(connection, userId, operatorSecret, expectedSecret);
    console.log("Super Admin bootstrap completed and audited.");
    console.log(`Target user: ${userId}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Super Admin bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
