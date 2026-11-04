import "server-only";
import { Pool } from "pg";

const globalDb = globalThis as typeof globalThis & { anchorPool?: Pool };

export function database(): Pool {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error("Configure DATABASE_URL or PGHOST before using the database API.");
  }
  if (!globalDb.anchorPool) {
    globalDb.anchorPool = new Pool({
      ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
    globalDb.anchorPool.on("error", (error) => console.error("Idle database connection failed", error));
  }
  return globalDb.anchorPool;
}
