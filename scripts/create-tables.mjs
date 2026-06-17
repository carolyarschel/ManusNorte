import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);

const tables = [
  `CREATE TABLE IF NOT EXISTS \`consultants\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(200) NOT NULL,
    \`level\` enum('junior','pleno','senior') NOT NULL DEFAULT 'junior',
    \`is_leader\` boolean NOT NULL DEFAULT false,
    \`max_days\` int NOT NULL DEFAULT 5,
    \`restrictions\` json,
    \`notes\` text,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`consultants_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`projects\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`acronym\` varchar(5) NOT NULL,
    \`client\` varchar(200) NOT NULL,
    \`status\` enum('confirmed','hot','cold','archived') NOT NULL DEFAULT 'cold',
    \`start_date\` date NOT NULL,
    \`end_date\` date NOT NULL,
    \`cadence\` enum('weekly','biweekly_odd','biweekly_even') NOT NULL DEFAULT 'weekly',
    \`visit_days\` json,
    \`leader_consultant_id\` int,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`projects_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`allocations\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`project_id\` int NOT NULL,
    \`consultant_id\` int NOT NULL,
    \`weekday\` int NOT NULL,
    \`role\` enum('líder','consultor') NOT NULL DEFAULT 'consultor',
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT \`allocations_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`pinned_slots\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`project_id\` int NOT NULL,
    \`consultant_id\` int NOT NULL,
    \`days_per_week\` int NOT NULL DEFAULT 1,
    \`visit_days\` json,
    \`assigned_days\` json,
    \`cadence\` enum('weekly','biweekly_odd','biweekly_even') DEFAULT 'weekly',
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT \`pinned_slots_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`level_slots\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`project_id\` int NOT NULL,
    \`level\` enum('junior','pleno','senior') NOT NULL,
    \`is_leader\` boolean NOT NULL DEFAULT false,
    \`days_per_week\` int NOT NULL DEFAULT 1,
    \`visit_days\` json,
    \`assigned_consultant_id\` int,
    \`assigned_days\` json,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT \`level_slots_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`absences\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`consultant_id\` int NOT NULL,
    \`start_date\` date NOT NULL,
    \`end_date\` date NOT NULL,
    \`reason\` text,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`absences_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_consultants_level\` ON \`consultants\` (\`level\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_consultants_is_leader\` ON \`consultants\` (\`is_leader\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_projects_status\` ON \`projects\` (\`status\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_allocations_project\` ON \`allocations\` (\`project_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_allocations_consultant\` ON \`allocations\` (\`consultant_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_pinned_slots_project\` ON \`pinned_slots\` (\`project_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_level_slots_project\` ON \`level_slots\` (\`project_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_absences_consultant\` ON \`absences\` (\`consultant_id\`)`,
];

for (const sql of tables) {
  const name = sql.match(/TABLE.*?`(\w+)`/)?.[1] || sql.match(/INDEX.*?ON.*?`(\w+)`/)?.[1] || "?";
  try {
    await conn.execute(sql);
    console.log(`✓ ${name}`);
  } catch (e) {
    if (e.code === "ER_DUP_KEYNAME" || e.message?.includes("already exists") || e.message?.includes("Duplicate")) {
      console.log(`~ ${name} (já existe)`);
    } else {
      console.error(`✗ ${name}: ${e.message}`);
    }
  }
}

await conn.end();
console.log("\nTabelas criadas com sucesso!");
