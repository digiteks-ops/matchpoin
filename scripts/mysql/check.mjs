import { assertMySql8, connectToMySql } from "./db.mjs";

async function main() {
  const connection = await connectToMySql();

  try {
    const version = await assertMySql8(connection);
    await connection.query("SELECT 1");
    console.log(`MySQL connection successful (version ${version}).`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`MySQL connection check failed: ${error.message}`);
  process.exitCode = 1;
});
