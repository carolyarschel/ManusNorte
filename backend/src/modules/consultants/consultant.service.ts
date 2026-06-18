import { consultantRepo, ConsultantRow } from "./consultant.repository";
import { NotFoundError } from "../../lib/errors";

/** Maps a DB row to the API response format. */
function toDTO(row: ConsultantRow) {
  return {
    id:           row.id,
    name:         row.name,
    level:        row.level,
    isLeader:     row.is_leader,
    maxDays:      row.max_days,
    restrictions: row.restrictions,
    notes:        row.notes ?? null,
  };
}

export const consultantService = {
  async getAll() {
    const rows = await consultantRepo.findAll();
    return rows.map(toDTO);
  },

  async getById(id: number) {
    const row = await consultantRepo.findById(id);
    if (!row) throw new NotFoundError("Consultor", id);
    return toDTO(row);
  },

  async create(data: {
    name: string;
    level: string;
    isLeader: boolean;
    maxDays: number;
    restrictions: number[];
    notes?: string | null;
  }) {
    const row = await consultantRepo.create({
      name:         data.name,
      level:        data.level,
      is_leader:    data.isLeader,
      max_days:     data.maxDays,
      restrictions: data.restrictions,
      notes:        data.notes,
    });
    return toDTO(row);
  },

  async update(id: number, data: Partial<{
    name: string;
    level: string;
    isLeader: boolean;
    maxDays: number;
    restrictions: number[];
    notes: string | null;
  }>) {
    const existing = await consultantRepo.findById(id);
    if (!existing) throw new NotFoundError("Consultor", id);

    const updateData: Parameters<typeof consultantRepo.update>[1] = {
      name:         data.name,
      level:        data.level,
      is_leader:    data.isLeader,
      max_days:     data.maxDays,
      restrictions: data.restrictions,
    };
    if ("notes" in data) updateData.notes = data.notes;

    const row = await consultantRepo.update(id, updateData);
    return toDTO(row!);
  },

  async remove(id: number) {
    const deleted = await consultantRepo.remove(id);
    if (!deleted) throw new NotFoundError("Consultor", id);
  },

  /** Returns the weekdays a consultant is already committed to. */
  async getBusyDays(id: number) {
    const existing = await consultantRepo.findById(id);
    if (!existing) throw new NotFoundError("Consultor", id);
    return consultantRepo.busyDays(id);
  },
};
