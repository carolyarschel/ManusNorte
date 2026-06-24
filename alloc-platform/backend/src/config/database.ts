import { Pool, types } from "pg";
import { env } from "./env";

// pg@8 parses DATE columns as JavaScript Date objects by default.
// Override to keep the raw "YYYY-MM-DD" string from PostgreSQL.
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  host:     env.DB_HOST,
  port:     env.DB_PORT,
  database: env.DB_NAME,
  user:     env.DB_USER,
  password: env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err);
});

/** Convenience: run a query and return rows */
export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params as unknown[]);
  return result.rows as T[];
}

/** Convenience: run a query and return first row or null */
export async function queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
