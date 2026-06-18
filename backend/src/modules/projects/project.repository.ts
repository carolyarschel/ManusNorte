import { query, queryOne, pool } from "../../config/database";
import { ConflictError } from "../../lib/errors";

export interface ProjectRow {
  id: number;
  acronym: string;
  client: string;
  status: string;
  start_date: string;
  end_date: string;
  cadence: string;
  visit_days: number[];
  leader_consultant_id: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LevelSlotRow {
  id: number;
  project_id: number;
  level: string;
  is_leader: boolean;
  days_per_week: number;
  visit_days: number[];
  assigned_consultant_id: number | null;
  assigned_days: number[];
}

export interface PinnedSlotRow {
  id: number;
  project_id: number;
  consultant_id: number;
  days_per_week: number;
  visit_days: number[];
  assigned_days: number[];
  cadence: string | null; // null = inherit project cadence
}

export interface AllocationRow {
  id: number;
  project_id: number;
  consultant_id: number;
  weekday: number;
  role: string;
}

export const projectRepo = {
  // ── Projects CRUD ──────────────────────────────────────────────────────────

  async findAll(): Promise<ProjectRow[]> {
    return query<ProjectRow>("SELECT * FROM projects ORDER BY id");
  },

  /** Single-round-trip alternative to findAll + 3×N slot/allocation queries. */
  async findAllWithRelations(): Promise<{
    projects: ProjectRow[];
    levelSlots: LevelSlotRow[];
    pinnedSlots: PinnedSlotRow[];
    allocations: AllocationRow[];
  }> {
    const [projects, levelSlots, pinnedSlots, allocations] = await Promise.all([
      query<ProjectRow>("SELECT * FROM projects ORDER BY id"),
      query<LevelSlotRow>("SELECT * FROM level_slots ORDER BY project_id, id"),
      query<PinnedSlotRow>("SELECT * FROM pinned_slots ORDER BY project_id, id"),
      query<AllocationRow>("SELECT * FROM allocations ORDER BY project_id, weekday"),
    ]);
    return { projects, levelSlots, pinnedSlots, allocations };
  },

  async findById(id: number): Promise<ProjectRow | null> {
    return queryOne<ProjectRow>("SELECT * FROM projects WHERE id = $1", [id]);
  },

  async findByAcronymAndClient(acronym: string, client: string): Promise<ProjectRow | null> {
    return queryOne<ProjectRow>(
      `SELECT * FROM projects
       WHERE acronym = $1 AND client = $2
         AND status != 'archived'
         AND end_date >= CURRENT_DATE`,
      [acronym, client],
    );
  },

  async create(data: {
    acronym: string; client: string; status: string;
    start_date: string; end_date: string; cadence: string;
    visit_days: number[]; notes?: string | null;
  }): Promise<ProjectRow> {
    const [row] = await query<ProjectRow>(
      `INSERT INTO projects (acronym, client, status, start_date, end_date, cadence, visit_days, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [data.acronym, data.client, data.status, data.start_date, data.end_date, data.cadence, data.visit_days, data.notes ?? null]
    );
    return row;
  },

  async update(id: number, data: Partial<{
    acronym: string; client: string; status: string;
    start_date: string; end_date: string; cadence: string;
    visit_days: number[]; leader_consultant_id: number | null;
    notes: string | null;
  }>): Promise<ProjectRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (data.acronym !== undefined)               { sets.push(`acronym = $${idx++}`);                vals.push(data.acronym); }
    if (data.client !== undefined)                { sets.push(`client = $${idx++}`);                 vals.push(data.client); }
    if (data.status !== undefined)                { sets.push(`status = $${idx++}`);                 vals.push(data.status); }
    if (data.start_date !== undefined)            { sets.push(`start_date = $${idx++}`);             vals.push(data.start_date); }
    if (data.end_date !== undefined)              { sets.push(`end_date = $${idx++}`);               vals.push(data.end_date); }
    if (data.cadence !== undefined)               { sets.push(`cadence = $${idx++}`);                vals.push(data.cadence); }
    if (data.visit_days !== undefined)            { sets.push(`visit_days = $${idx++}`);             vals.push(data.visit_days); }
    if ("leader_consultant_id" in data)           { sets.push(`leader_consultant_id = $${idx++}`);   vals.push(data.leader_consultant_id ?? null); }
    if ("notes" in data)                          { sets.push(`notes = $${idx++}`);                  vals.push(data.notes ?? null); }

    if (!sets.length) return this.findById(id);

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const [row] = await query<ProjectRow>(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    return row ?? null;
  },

  /**
   * Atomically update project metadata AND replace all slots.
   * When slots are provided, existing level_slots and pinned_slots are deleted
   * and replaced. When slots are omitted, only metadata is updated.
   */
  async updateFull(
    id: number,
    fields: Partial<{
      acronym: string; client: string; status: string;
      start_date: string; end_date: string; cadence: string;
      leader_consultant_id: number | null; notes: string | null;
    }>,
    slots?: {
      levelSlots: { level: string; is_leader: boolean; days_per_week: number; visit_days: number[] }[];
      pinnedSlots: { consultant_id: number; days_per_week: number; visit_days: number[]; cadence?: string | null }[];
    },
  ): Promise<ProjectRow | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Build dynamic SET clause for project fields
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (fields.acronym !== undefined)             { sets.push(`acronym = $${idx++}`);              vals.push(fields.acronym); }
      if (fields.client !== undefined)              { sets.push(`client = $${idx++}`);               vals.push(fields.client); }
      if (fields.status !== undefined)              { sets.push(`status = $${idx++}`);               vals.push(fields.status); }
      if (fields.start_date !== undefined)          { sets.push(`start_date = $${idx++}`);           vals.push(fields.start_date); }
      if (fields.end_date !== undefined)            { sets.push(`end_date = $${idx++}`);             vals.push(fields.end_date); }
      if (fields.cadence !== undefined)             { sets.push(`cadence = $${idx++}`);              vals.push(fields.cadence); }
      if ("leader_consultant_id" in fields)         { sets.push(`leader_consultant_id = $${idx++}`); vals.push(fields.leader_consultant_id ?? null); }
      if ("notes" in fields)                        { sets.push(`notes = $${idx++}`);                vals.push(fields.notes ?? null); }

      let row: ProjectRow | null = null;
      if (sets.length) {
        sets.push(`updated_at = NOW()`);
        vals.push(id);
        const { rows } = await client.query(
          `UPDATE projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals,
        );
        row = rows[0] ?? null;
      } else {
        const { rows } = await client.query("SELECT * FROM projects WHERE id = $1", [id]);
        row = rows[0] ?? null;
      }

      // Replace slots when provided
      if (slots) {
        await client.query("DELETE FROM level_slots  WHERE project_id = $1", [id]);
        await client.query("DELETE FROM pinned_slots WHERE project_id = $1", [id]);
        await client.query("DELETE FROM allocations  WHERE project_id = $1", [id]);
        await client.query(
          "UPDATE projects SET visit_days = '{}', updated_at = NOW() WHERE id = $1", [id]
        );

        for (const s of slots.levelSlots) {
          await client.query(
            `INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, s.level, s.is_leader, s.days_per_week, s.visit_days],
          );
        }
        for (const s of slots.pinnedSlots) {
          await client.query(
            `INSERT INTO pinned_slots (project_id, consultant_id, days_per_week, visit_days, cadence)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, s.consultant_id, s.days_per_week, s.visit_days, s.cadence ?? null],
          );
        }
      }

      await client.query("COMMIT");
      return row;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async remove(id: number): Promise<boolean> {
    const [row] = await query("DELETE FROM projects WHERE id = $1 RETURNING id", [id]);
    return !!row;
  },

  // ── Level slots ────────────────────────────────────────────────────────────

  async getLevelSlots(projectId: number): Promise<LevelSlotRow[]> {
    return query<LevelSlotRow>(
      "SELECT * FROM level_slots WHERE project_id = $1 ORDER BY id", [projectId]
    );
  },

  async addLevelSlot(projectId: number, data: {
    level: string; is_leader: boolean; days_per_week: number; visit_days: number[];
  }): Promise<LevelSlotRow> {
    const [row] = await query<LevelSlotRow>(
      `INSERT INTO level_slots (project_id, level, is_leader, days_per_week, visit_days)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, data.level, data.is_leader, data.days_per_week, data.visit_days]
    );
    return row;
  },

  async removeLevelSlot(slotId: number): Promise<boolean> {
    const [row] = await query("DELETE FROM level_slots WHERE id = $1 RETURNING id", [slotId]);
    return !!row;
  },

  // ── Pinned slots ───────────────────────────────────────────────────────────

  async getPinnedSlots(projectId: number): Promise<PinnedSlotRow[]> {
    return query<PinnedSlotRow>(
      "SELECT * FROM pinned_slots WHERE project_id = $1 ORDER BY id", [projectId]
    );
  },

  async addPinnedSlot(projectId: number, data: {
    consultant_id: number; days_per_week: number; visit_days: number[]; cadence?: string | null;
  }): Promise<PinnedSlotRow> {
    const [row] = await query<PinnedSlotRow>(
      `INSERT INTO pinned_slots (project_id, consultant_id, days_per_week, visit_days, cadence)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, data.consultant_id, data.days_per_week, data.visit_days, data.cadence ?? null]
    );
    return row;
  },

  async removePinnedSlot(slotId: number): Promise<boolean> {
    const [row] = await query("DELETE FROM pinned_slots WHERE id = $1 RETURNING id", [slotId]);
    return !!row;
  },

  // ── Allocations ────────────────────────────────────────────────────────────

  async getAllocations(projectId: number): Promise<AllocationRow[]> {
    return query<AllocationRow>(
      "SELECT * FROM allocations WHERE project_id = $1 ORDER BY weekday", [projectId]
    );
  },

  /**
   * Set allocations for a project atomically.
   * Deletes existing allocations and inserts new ones in a transaction.
   * Checks the one-consultant-per-day rule before inserting.
   */
  async setAllocations(
    projectId: number,
    allocations: { consultant_id: number; weekday: number; role: string }[],
    projectCadence: string,
  ): Promise<AllocationRow[]> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '30s'");

      // Remove old allocations for this project
      await client.query("DELETE FROM allocations WHERE project_id = $1", [projectId]);

      // Load this project's date range for overlap checks
      const { rows: [proj] } = await client.query(
        "SELECT start_date, end_date FROM projects WHERE id = $1", [projectId]
      );

      const inserted: AllocationRow[] = [];
      for (const alloc of allocations) {
        // Check: is this consultant on another project on this weekday WITH overlapping dates?
        const { rows: conflicts } = await client.query(
          `SELECT a.*, p.cadence
           FROM allocations a JOIN projects p ON a.project_id = p.id
           WHERE a.consultant_id = $1
             AND a.weekday = $2
             AND p.id != $3
             AND p.status != 'archived'
             AND p.start_date <= $4
             AND p.end_date   >= $5`,
          [alloc.consultant_id, alloc.weekday, projectId, proj.end_date, proj.start_date]
        );

        for (const conflict of conflicts) {
          const alternating =
            (projectCadence === "biweekly_odd" && conflict.cadence === "biweekly_even") ||
            (projectCadence === "biweekly_even" && conflict.cadence === "biweekly_odd");

          if (!alternating) {
            const { rows: [c] } = await client.query(
              "SELECT name FROM consultants WHERE id = $1", [alloc.consultant_id]
            );
            await client.query("ROLLBACK");
            throw new ConflictError(
              `${c?.name ?? `Consultor #${alloc.consultant_id}`} já está alocado em outro projeto na ${["","seg","ter","qua","qui","sex"][alloc.weekday]}`,
            );
          }
        }

        const { rows } = await client.query(
          `INSERT INTO allocations (project_id, consultant_id, weekday, role)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [projectId, alloc.consultant_id, alloc.weekday, alloc.role]
        );
        inserted.push(rows[0]);
      }

      // Update the project's visit_days as the union of all allocated weekdays
      const allDays = [...new Set(allocations.map((a) => a.weekday))].sort();
      await client.query(
        "UPDATE projects SET visit_days = $1, updated_at = NOW() WHERE id = $2",
        [allDays, projectId]
      );

      // Sync assigned_days on pinned_slots
      await client.query(
        `UPDATE pinned_slots ps
         SET assigned_days = (
           SELECT COALESCE(ARRAY_AGG(a.weekday ORDER BY a.weekday), ARRAY[]::int[])
           FROM allocations a
           WHERE a.project_id = ps.project_id AND a.consultant_id = ps.consultant_id
         )
         WHERE ps.project_id = $1`,
        [projectId],
      );

      // Reset level_slots assignments, then re-match from the new allocations
      await client.query(
        `UPDATE level_slots SET assigned_consultant_id = NULL, assigned_days = ARRAY[]::int[]
         WHERE project_id = $1`,
        [projectId],
      );

      const { rows: pinnedCons } = await client.query<{ consultant_id: number }>(
        `SELECT consultant_id FROM pinned_slots WHERE project_id = $1`,
        [projectId],
      );
      const pinnedIds = new Set<number>(pinnedCons.map((r) => r.consultant_id));

      // Group non-pinned allocations by consultant
      const nonPinnedMap = new Map<number, { days: number[]; isLeader: boolean }>();
      for (const alloc of allocations) {
        if (pinnedIds.has(alloc.consultant_id)) continue;
        if (!nonPinnedMap.has(alloc.consultant_id)) {
          nonPinnedMap.set(alloc.consultant_id, { days: [], isLeader: alloc.role === "lider" || alloc.role === "líder" });
        }
        nonPinnedMap.get(alloc.consultant_id)!.days.push(alloc.weekday);
      }

      // Assign each non-pinned consultant to a matching unoccupied level_slot
      for (const [cId, { days, isLeader }] of nonPinnedMap.entries()) {
        const { rows: slots } = await client.query(
          `SELECT id FROM level_slots
           WHERE project_id = $1 AND is_leader = $2 AND assigned_consultant_id IS NULL
           ORDER BY id LIMIT 1`,
          [projectId, isLeader],
        );
        if (slots.length > 0) {
          await client.query(
            `UPDATE level_slots SET assigned_consultant_id = $1, assigned_days = $2 WHERE id = $3`,
            [cId, days.sort((a, b) => a - b), slots[0].id],
          );
        }
      }

      await client.query("COMMIT");
      return inserted;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async removeAllocations(projectId: number): Promise<void> {
    await query("DELETE FROM allocations WHERE project_id = $1", [projectId]);
    await query("UPDATE projects SET visit_days = '{}', updated_at = NOW() WHERE id = $1", [projectId]);
  },
};
