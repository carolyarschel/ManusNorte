import fs from "fs";
import path from "path";
import { pool, query } from "../config/database";

async function migrate() {
  console.log("🔄 Running migrations...\n");

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already applied migrations
  const applied = await query<{ filename: string }>("SELECT filename FROM _migrations ORDER BY id");
  const appliedSet = new Set(applied.map((r) => r.filename));

  // Read migration files
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ✅ ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

    try {
      await query("BEGIN");
      await query(sql);
      await query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
      await query("COMMIT");
      console.log(`  🆕 ${file} (applied)`);
      count++;
    } catch (err: any) {
      await query("ROLLBACK");
      console.error(`  ❌ ${file} FAILED:`, err.message);
      process.exit(1);
    }
  }

  console.log(`\n✅ Migrations complete. ${count} new, ${files.length - count} already applied.\n`);
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
