import { query, queryOne } from "../../config/database";

export interface ConsultantRow {
  id: number;
  name: string;
  level: string;
  is_leader: boolean;
  max_days: number;
  restrictions: number[];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export const consultantRepo = {
  async findAll(): Promise<ConsultantRow[]> {
    return query<ConsultantRow>("SELECT * FROM consultants ORDER BY id");
  },

  async findById(id: number): Promise<ConsultantRow | null> {
    return queryOne<ConsultantRow>("SELECT * FROM consultants WHERE id = $1", [id]);
  },

  async create(data: {
    name: string;
    level: string;
    is_leader: boolean;
    max_days: number;
    restrictions: number[];
    notes?: string | null;
  }): Promise<ConsultantRow> {
    const [row] = await query<ConsultantRow>(
      `INSERT INTO consultants (name, level, is_leader, max_days, restrictions, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.name, data.level, data.is_leader, data.max_days, data.restrictions, data.notes ?? null]
    );
    return row;
  },

  async update(id: number, data: Partial<{
    name: string;
    level: string;
    is_leader: boolean;
    max_days: number;
    restrictions: number[];
    notes: string | null;
  }>): Promise<ConsultantRow | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (data.name !== undefined)        { sets.push(`name = $${idx++}`);         vals.push(data.name); }
    if (data.level !== undefined)       { sets.push(`level = $${idx++}`);        vals.push(data.level); }
    if (data.is_leader !== undefined)   { sets.push(`is_leader = $${idx++}`);    vals.push(data.is_leader); }
    if (data.max_days !== undefined)    { sets.push(`max_days = $${idx++}`);     vals.push(data.max_days); }
    if (data.restrictions !== undefined){ sets.push(`restrictions = $${idx++}`); vals.push(data.restrictions); }
    if ("notes" in data)                { sets.push(`notes = $${idx++}`);        vals.push(data.notes ?? null); }

    if (!sets.length) return this.findById(id);

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const [row] = await query<ConsultantRow>(
      `UPDATE consultants SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    return row ?? null;
  },

  async remove(id: number): Promise<boolean> {
    const [row] = await query("DELETE FROM consultants WHERE id = $1 RETURNING id", [id]);
    return !!row;
  },

  /** Days this consultant is already allocated on active (non-archived) projects. */
  async busyDays(consultantId: number): Promise<{ weekday: number; project_id: number; cadence: string }[]> {
    return query(
      `SELECT a.weekday, a.project_id, p.cadence
       FROM allocations a
       JOIN projects p ON a.project_id = p.id
       WHERE a.consultant_id = $1 AND p.status != 'archived'
       ORDER BY a.weekday`,
      [consultantId]
    );
  },
};
