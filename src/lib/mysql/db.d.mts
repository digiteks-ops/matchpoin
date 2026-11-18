import type { Connection } from "mysql2/promise";

export function getConnectionOptions(
  databaseUrl: string | undefined,
  options?: Record<string, unknown>
): { uri: string } & Record<string, unknown>;

export function connectToMySql(options?: Record<string, unknown>): Promise<Connection>;
export function assertMySql8(connection: Connection): Promise<string>;
