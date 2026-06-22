/**
 * MySQL adapter that mimics the original PostgreSQL `query` / `queryOne` interface.
 * Converts $1, $2, … placeholders to ? and simulates RETURNING * for INSERT/UPDATE/DELETE.
 */
import mysql from "mysql2/promise";

let _pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _pool = mysql.createPool(url + "?ssl={'rejectUnauthorized':true}");
  }
  return _pool;
}

/** Convert PostgreSQL-style $1,$2,… placeholders to MySQL ? */
function pgToMysql(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

/** Serialize arrays/objects to JSON for MySQL JSON columns */
function serializeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (Array.isArray(p)) return JSON.stringify(p);
    return p;
  });
}

/** Parse JSON columns back to arrays/objects */
function parseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && (trimmed.endsWith("]") || trimmed.endsWith("}"))) {
        try { out[k] = JSON.parse(trimmed); continue; } catch {}
      }
    }
    // Convert MySQL tinyint(1) booleans
    if (typeof v === "number" && (v === 0 || v === 1) && (k === "is_leader")) {
      out[k] = v === 1;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Execute a SQL statement and return all result rows.
 * For INSERT/UPDATE/DELETE with RETURNING *, we simulate it by:
 *   1. Stripping the RETURNING clause
 *   2. Running the statement
 *   3. For INSERT: SELECT WHERE id = lastInsertId
 *   4. For UPDATE/DELETE: SELECT WHERE id = last param (assumed)
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPool();
  const upperSql = sql.trim().toUpperCase();

  // Handle RETURNING * simulation
  const returningMatch = sql.match(/\s+RETURNING\s+\*/i);
  if (returningMatch) {
    const cleanSql = sql.replace(/\s+RETURNING\s+\*/i, "").trim();
    const mysqlSql = pgToMysql(cleanSql);
    const serialized = serializeParams(params);

    const [result] = await pool.execute(mysqlSql, serialized) as [mysql.ResultSetHeader, mysql.FieldPacket[]];

    // Determine the table name
    const tableMatch = cleanSql.match(/(?:INTO|UPDATE|FROM|DELETE\s+FROM)\s+(\w+)/i);
    const table = tableMatch?.[1];
    if (!table) return [];

    let selectSql: string;
    if (upperSql.startsWith("INSERT")) {
      selectSql = `SELECT * FROM ${table} WHERE id = ${result.insertId}`;
    } else if (upperSql.startsWith("UPDATE")) {
      // Last param is the id
      const id = serialized[serialized.length - 1];
      selectSql = `SELECT * FROM ${table} WHERE id = ${Number(id)}`;
    } else if (upperSql.startsWith("DELETE")) {
      // Return the id that was deleted (we already deleted it, just return a stub)
      return [{ id: serialized[serialized.length - 1] } as unknown as T];
    } else {
      return [];
    }

    const [rows] = await pool.execute(selectSql) as [Record<string, unknown>[], mysql.FieldPacket[]];
    return (rows as Record<string, unknown>[]).map(parseRow) as T[];
  }

  // Handle CURRENT_DATE
  const finalSql = pgToMysql(sql).replace(/CURRENT_DATE/g, "CURDATE()");
  const serialized = serializeParams(params);

  const [rows] = await pool.execute(finalSql, serialized) as [Record<string, unknown>[] | mysql.ResultSetHeader, mysql.FieldPacket[]];

  if (Array.isArray(rows)) {
    return (rows as Record<string, unknown>[]).map(parseRow) as T[];
  }
  return [];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Transaction helper — returns a client-like object */
export async function withTransaction<T>(
  fn: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  const client: TransactionClient = {
    async query(sql: string, params: unknown[] = []) {
      const upperSql = sql.trim().toUpperCase();
      const returningMatch = sql.match(/\s+RETURNING\s+\*/i);
      if (returningMatch) {
        const cleanSql = sql.replace(/\s+RETURNING\s+\*/i, "").trim();
        const mysqlSql = pgToMysql(cleanSql).replace(/CURRENT_DATE/g, "CURDATE()");
        const serialized = serializeParams(params);
        const [result] = await conn.execute(mysqlSql, serialized) as [mysql.ResultSetHeader, mysql.FieldPacket[]];

        const tableMatch = cleanSql.match(/(?:INTO|UPDATE|FROM|DELETE\s+FROM)\s+(\w+)/i);
        const table = tableMatch?.[1];
        if (!table) return { rows: [] };

        let selectSql: string;
        if (upperSql.startsWith("INSERT")) {
          selectSql = `SELECT * FROM ${table} WHERE id = ${result.insertId}`;
        } else if (upperSql.startsWith("UPDATE")) {
          const id = serialized[serialized.length - 1];
          selectSql = `SELECT * FROM ${table} WHERE id = ${Number(id)}`;
        } else {
          return { rows: [{ id: serialized[serialized.length - 1] }] };
        }
        const [rows] = await conn.execute(selectSql) as [Record<string, unknown>[], mysql.FieldPacket[]];
        return { rows: (rows as Record<string, unknown>[]).map(parseRow) };
      }

      // Special handling for ARRAY_AGG and PostgreSQL-specific syntax
      let finalSql = pgToMysql(sql)
        .replace(/CURRENT_DATE/g, "CURDATE()")
        .replace(/ARRAY\[\]::int\[\]/g, "JSON_ARRAY()")
        .replace(/COALESCE\(ARRAY_AGG\(([^)]+)\s+ORDER BY\s+([^)]+)\),\s*ARRAY\[\]::int\[\]\)/gi,
          (_, expr, order) => `COALESCE(JSON_ARRAYAGG(${ expr} ORDER BY ${order}), JSON_ARRAY())`)
        .replace(/SET LOCAL statement_timeout = '[^']+'/i, "SET @dummy = 0");

      const serialized = serializeParams(params);
      const [rows] = await conn.execute(finalSql, serialized) as [Record<string, unknown>[] | mysql.ResultSetHeader, mysql.FieldPacket[]];
      if (Array.isArray(rows)) {
        return { rows: (rows as Record<string, unknown>[]).map(parseRow) };
      }
      return { rows: [] };
    },
    async release() {
      conn.release();
    },
  };

  try {
    const result = await fn(client);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): Promise<void>;
}

/** Fake pool.connect() for compatibility with original code that uses pool.connect() */
export const pool = {
  async connect(): Promise<TransactionClient & { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }> {
    const mysqlPool = getPool();
    const conn = await mysqlPool.getConnection();
    let committed = false;

    const client = {
      async query(sql: string, params: unknown[] = []) {
        const upperSql = sql.trim().toUpperCase();

        if (upperSql === "BEGIN") { await conn.beginTransaction(); return { rows: [] }; }
        if (upperSql === "COMMIT") { await conn.commit(); committed = true; return { rows: [] }; }
        if (upperSql === "ROLLBACK") { await conn.rollback(); committed = true; return { rows: [] }; }

        const returningMatch = sql.match(/\s+RETURNING\s+\*/i);
        if (returningMatch) {
          const cleanSql = sql.replace(/\s+RETURNING\s+\*/i, "").trim();
          const mysqlSql = pgToMysql(cleanSql).replace(/CURRENT_DATE/g, "CURDATE()");
          const serialized = serializeParams(params);
          const [result] = await conn.execute(mysqlSql, serialized) as [mysql.ResultSetHeader, mysql.FieldPacket[]];

          const tableMatch = cleanSql.match(/(?:INTO|UPDATE|FROM|DELETE\s+FROM)\s+(\w+)/i);
          const table = tableMatch?.[1];
          if (!table) return { rows: [] };

          let selectSql: string;
          if (upperSql.startsWith("INSERT")) {
            selectSql = `SELECT * FROM ${table} WHERE id = ${result.insertId}`;
          } else if (upperSql.startsWith("UPDATE")) {
            const id = serialized[serialized.length - 1];
            selectSql = `SELECT * FROM ${table} WHERE id = ${Number(id)}`;
          } else {
            return { rows: [{ id: serialized[serialized.length - 1] }] };
          }
          const [rows] = await conn.execute(selectSql) as [Record<string, unknown>[], mysql.FieldPacket[]];
          return { rows: (rows as Record<string, unknown>[]).map(parseRow) };
        }

        let finalSql = pgToMysql(sql)
          .replace(/CURRENT_DATE/g, "CURDATE()")
          .replace(/ARRAY\[\]::int\[\]/g, "JSON_ARRAY()")
          .replace(/COALESCE\(ARRAY_AGG\(([^)]+)\s+ORDER BY\s+([^)]+)\),\s*ARRAY\[\]::int\[\]\)/gi,
            (_, expr, order) => `COALESCE(JSON_ARRAYAGG(${expr} ORDER BY ${order}), JSON_ARRAY())`)
          .replace(/SET LOCAL statement_timeout = '[^']+'/i, "SET @dummy = 0");

        const serialized = serializeParams(params);
        const [rows] = await conn.execute(finalSql, serialized) as [Record<string, unknown>[] | mysql.ResultSetHeader, mysql.FieldPacket[]];
        if (Array.isArray(rows)) {
          return { rows: (rows as Record<string, unknown>[]).map(parseRow) };
        }
        return { rows: [] };
      },
      async release() {
        if (!committed) {
          try { await conn.rollback(); } catch {}
        }
        conn.release();
      },
    };
    return client;
  },
};
