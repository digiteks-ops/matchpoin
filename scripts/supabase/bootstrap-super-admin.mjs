/**
 * One-time Super Admin bootstrap on Supabase (server-side operator procedure).
 *
 * It never creates accounts and is not reachable over HTTP. The privilege grant
 * is performed by public.bootstrap_first_super_admin(...), which refuses to run
 * when a Super Admin already exists and audits the change.
 *
 * Usage:
 *   1. Set MATCHPOIN_BOOTSTRAP_SECRET in .env.local (long random value, used
 *      only for this run; never committed, never read by the app).
 *   2. Run:
 *        npm run db:bootstrap-super-admin -- --email=operator@example.com --confirm
 *   3. Type the same secret when prompted.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

function readFlag(name) {
  const prefix = `--${name}=`;
  const withValue = process.argv.find((arg) => arg.startsWith(prefix));
  if (withValue) return withValue.slice(prefix.length);
  return process.argv.includes(`--${name}`) ? true : undefined;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveUserId(supabase, userId, email) {
  if (typeof userId === "string" && userId.trim()) return userId.trim();
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Provide --user-id=<uuid> or --email=<address>.");
  }
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Lookup failed: ${error.message}`);
  if (!data) throw new Error("No user found for that email.");
  return data.id;
}

async function main() {
  const expectedSecret = process.env.MATCHPOIN_BOOTSTRAP_SECRET;
  if (!expectedSecret) {
    throw new Error("MATCHPOIN_BOOTSTRAP_SECRET is not set. Set it in .env.local for this one-time run.");
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
  if (operatorSecret !== expectedSecret) {
    throw new Error("Operator verification rejected.");
  }

  const supabase = getAdminClient();
  const userId = await resolveUserId(supabase, readFlag("user-id"), readFlag("email"));
  const { error } = await supabase.rpc("bootstrap_first_super_admin", { p_user_id: userId });
  if (error) throw new Error(error.message);

  console.log("Super Admin bootstrap completed and audited.");
  console.log(`Target user: ${userId}`);
}

main().catch((error) => {
  console.error(`Super Admin bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
