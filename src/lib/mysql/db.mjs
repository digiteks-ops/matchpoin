import mysql from "mysql2/promise";

export function getConnectionOptions(databaseUrl, options = {}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Add a private MySQL connection URL to .env.local.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid MySQL connection URL.");
  }

  if (parsedUrl.protocol !== "mysql:" || !parsedUrl.hostname || parsedUrl.pathname.length < 2) {
    throw new Error("DATABASE_URL must use mysql:// and include a host and database name.");
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const sslSetting = parsedUrl.searchParams.get("ssl");
  if (!isLocalHost && !sslSetting && options.ssl === undefined) {
    throw new Error("Remote MySQL connections must configure TLS with the ssl URL option.");
  }
  if (!isLocalHost) {
    let sslConfig = options.ssl ?? sslSetting;
    try {
      sslConfig = JSON.parse(sslConfig);
    } catch {
      // Named mysql2 TLS profiles are valid string values.
    }

    if (
      (!sslConfig || (typeof sslConfig !== "object" && typeof sslConfig !== "string")) ||
      (typeof sslConfig === "object" && sslConfig.rejectUnauthorized === false)
    ) {
      throw new Error("Remote MySQL TLS must use a profile or a verified TLS configuration.");
    }
  }

  return { uri: databaseUrl, ...options };
}

export async function connectToMySql(options = {}) {
  const connection = await mysql.createConnection(
    getConnectionOptions(process.env.DATABASE_URL, options)
  );
  try {
    await connection.query("SET time_zone = '+00:00'");
    return connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

export async function assertMySql8(connection) {
  const [rows] = await connection.query(
    "SELECT VERSION() AS version, @@version_comment AS version_comment"
  );
  const { version, version_comment: versionComment } = rows[0];
  const serverDescription = `${version} ${versionComment}`;

  if (/mariadb/i.test(serverDescription)) {
    throw new Error("MariaDB was detected. This foundation requires MySQL 8.0 or newer.");
  }

  const majorVersion = Number.parseInt(String(version).split(".")[0], 10);
  if (!Number.isFinite(majorVersion) || majorVersion < 8) {
    throw new Error(`MySQL 8.0 or newer is required; detected ${version}.`);
  }

  return String(version);
}
