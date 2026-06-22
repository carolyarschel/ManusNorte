import { pool, query } from "../config/database";

async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ Seed bloqueado em produção. Defina NODE_ENV != 'production' para executar.");
    process.exit(1);
  }

  console.log("🌱 Seeding database...\n");

  // Clear existing data
  await query("TRUNCATE allocations, pinned_slots, level_slots, projects, consultants RESTART IDENTITY CASCADE");

  // ── Consultants ──────────────────────────────────────────────────────────

  const consultants = [
    { name: "Ana Rodrigues",  level: "senior", is_leader: true,  max_days: 5, restrictions: []    },
    { name: "Bruno Melo",     level: "senior", is_leader: true,  max_days: 3, restrictions: [3]   },
    { name: "Carla Souza",    level: "pleno",  is_leader: true,  max_days: 5, restrictions: []    },
    { name: "Diego Lima",     level: "pleno",  is_leader: false, max_days: 2, restrictions: [1,5] },
    { name: "Elena Ferreira", level: "pleno",  is_leader: false, max_days: 5, restrictions: []    },
    { name: "Felipe Castro",  level: "junior", is_leader: false, max_days: 5, restrictions: []    },
    { name: "Gabriela Nunes", level: "junior", is_leader: false, max_days: 4, restrictions: [5]   },
    { name: "Henrique Pires", level: "junior", is_leader: false, max_days: 5, restrictions: []    },
  ];

  for (const c of consultants) {
    await query(
      `INSERT INTO consultants (name, level, is_leader, max_days, restrictions)
       VALUES ($1, $2, $3, $4, $5)`,
      [c.name, c.level, c.is_leader, c.max_days, c.restrictions]
    );
  }
  console.log(`  ✅ ${consultants.length} consultants inserted`);

  // ── Projects ─────────────────────────────────────────────────────────────

  // Project 1: TDG - Banco Alfa (Mon/Wed weekly)
  //   Ana (senior leader) -> Mon, Wed
  //   Carla (pleno) -> Wed only
  //   Felipe (junior) -> Mon, Wed
  const [tdg] = await query<{ id: number }>(
    `INSERT INTO projects (acronym, client, status, start_date, end_date, cadence, visit_days)
     VALUES ('TDG', 'Banco Alfa', 'confirmed', '2026-05-01', '2026-08-29', 'weekly', '{1,3}')
     RETURNING id`
  );

  await query(
    `INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days, assigned_consultant_id, assigned_days)
     VALUES ($1, 'senior', true, 2, '{1,3}', 1, '{1,3}')`, [tdg.id]
  );
  await query(
    `INSERT INTO pinned_slots (project_id, consultant_id, days_per_week, visit_days, assigned_days)
     VALUES ($1, 3, 1, '{3}', '{3}')`, [tdg.id]
  );
  await query(
    `INSERT INTO pinned_slots (project_id, consultant_id, days_per_week, visit_days, assigned_days)
     VALUES ($1, 6, 2, '{1,3}', '{1,3}')`, [tdg.id]
  );

  // Allocations for TDG
  await query(`INSERT INTO allocations (project_id, consultant_id, weekday, role) VALUES
    ($1, 1, 1, 'lider'), ($1, 1, 3, 'lider'),
    ($1, 3, 3, 'consultor'),
    ($1, 6, 1, 'consultor'), ($1, 6, 3, 'consultor')`, [tdg.id]);

  // Project 2: RFN - Indústrias Beta (Tue/Thu weekly)
  //   Bruno (senior leader) -> Tue, Thu
  //   Elena (pleno) -> Tue, Thu
  const [rfn] = await query<{ id: number }>(
    `INSERT INTO projects (acronym, client, status, start_date, end_date, cadence, visit_days)
     VALUES ('RFN', 'Indústrias Beta', 'confirmed', '2026-05-01', '2026-07-25', 'weekly', '{2,4}')
     RETURNING id`
  );

  await query(
    `INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days, assigned_consultant_id, assigned_days)
     VALUES ($1, 'senior', true, 2, '{2,4}', 2, '{2,4}')`, [rfn.id]
  );
  await query(
    `INSERT INTO pinned_slots (project_id, consultant_id, days_per_week, visit_days, assigned_days)
     VALUES ($1, 5, 2, '{2,4}', '{2,4}')`, [rfn.id]
  );

  await query(`INSERT INTO allocations (project_id, consultant_id, weekday, role) VALUES
    ($1, 2, 2, 'lider'), ($1, 2, 4, 'lider'),
    ($1, 5, 2, 'consultor'), ($1, 5, 4, 'consultor')`, [rfn.id]);

  // Project 3: ADP - Varejo Gama (Thu biweekly odd)
  //   Carla (pleno leader) -> Thu (odd weeks only, no conflict with TDG Wed)
  //   Gabriela (junior) -> Thu
  const [adp] = await query<{ id: number }>(
    `INSERT INTO projects (acronym, client, status, start_date, end_date, cadence, visit_days)
     VALUES ('ADP', 'Varejo Gama', 'confirmed', '2026-05-15', '2026-09-30', 'biweekly_odd', '{4}')
     RETURNING id`
  );

  await query(
    `INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days, assigned_consultant_id, assigned_days)
     VALUES ($1, 'pleno', true, 1, '{4}', 3, '{4}')`, [adp.id]
  );
  await query(
    `INSERT INTO pinned_slots (project_id, consultant_id, days_per_week, visit_days, assigned_days)
     VALUES ($1, 7, 1, '{4}', '{4}')`, [adp.id]
  );

  await query(`INSERT INTO allocations (project_id, consultant_id, weekday, role) VALUES
    ($1, 3, 4, 'lider'),
    ($1, 7, 4, 'consultor')`, [adp.id]);

  // Project 4: EXP - Tech Delta (hot, biweekly even, unresolved)
  const [exp] = await query<{ id: number }>(
    `INSERT INTO projects (acronym, client, status, start_date, end_date, cadence, visit_days)
     VALUES ('EXP', 'Tech Delta', 'hot', '2026-06-02', '2026-10-31', 'biweekly_even', '{}')
     RETURNING id`
  );

  await query(`INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days) VALUES
    ($1, 'senior', true,  1, '{}'),
    ($1, 'junior', false, 2, '{}'),
    ($1, 'junior', false, 2, '{}')`, [exp.id]);

  // Project 5: CGV - Saúde Épsilon (cold, unresolved)
  const [cgv] = await query<{ id: number }>(
    `INSERT INTO projects (acronym, client, status, start_date, end_date, cadence, visit_days)
     VALUES ('CGV', 'Saúde Épsilon', 'cold', '2026-07-01', '2026-11-28', 'weekly', '{}')
     RETURNING id`
  );

  await query(`INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days) VALUES
    ($1, 'pleno',  false, 1, '{}'),
    ($1, 'junior', false, 1, '{}')`, [cgv.id]);

  console.log("  ✅ 5 projects with slots and allocations inserted");
  console.log("\n✅ Seed complete.\n");

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
