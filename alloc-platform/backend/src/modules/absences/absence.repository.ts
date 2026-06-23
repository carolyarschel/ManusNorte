import { query, queryOne } from "../../config/database";

export interface AbsenceRow {
  id: number;
  consultant_id: number;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export const absenceRepo = {
  async findByConsultant(consultantId: number): Promise<AbsenceRow[]> {
    return query<AbsenceRow>(
      "SELECT * FROM absences WHERE consultant_id = $1 ORDER BY start_date",
      [consultantId]
    );
  },

  async findAll(): Promise<AbsenceRow[]> {
    return query<AbsenceRow>("SELECT * FROM absences ORDER BY consultant_id, start_date");
  },

  async findById(id: number): Promise<AbsenceRow | null> {
    return queryOne<AbsenceRow>("SELECT * FROM absences WHERE id = $1", [id]);
  },

  async create(data: {
    consultant_id: number;
    start_date: string;
    end_date: string;
    reason?: string | null;
  }): Promise<AbsenceRow> {
    const [row] = await query<AbsenceRow>(
      `INSERT INTO absences (consultant_id, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.consultant_id, data.start_date, data.end_date, data.reason ?? null]
    );
    return row;
  },

  async update(id: number, data: Partial<{
    start_date: string;
    end_date: string;
    reason: string | null;
  }>): Promise<AbsenceRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (data.start_date !== undefined) { sets.push(`start_date = $${idx++}`); vals.push(data.start_date); }
    if (data.end_date !== undefined)   { sets.push(`end_date = $${idx++}`);   vals.push(data.end_date); }
    if ("reason" in data)              { sets.push(`reason = $${idx++}`);     vals.push(data.reason ?? null); }

    if (!sets.length) return this.findById(id);

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const [row] = await query<AbsenceRow>(
      `UPDATE absences SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    return row ?? null;
  },

  async remove(id: number): Promise<boolean> {
    const [row] = await query("DELETE FROM absences WHERE id = $1 RETURNING id", [id]);
    return !!row;
  },
};
