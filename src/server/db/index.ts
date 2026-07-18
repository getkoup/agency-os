import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

// Serverless instances must not retain postgres.js's default 10-connection pool.
const conn =
  globalForDb.conn ??
  postgres(
    env.DATABASE_URL,
    env.NODE_ENV === "production"
      ? {
          max: 1,
          prepare: false,
          idle_timeout: 10,
          connect_timeout: 10,
          max_lifetime: 5 * 60,
        }
      : {},
  );
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
