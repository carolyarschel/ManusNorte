import { projectRepo, ProjectRow, LevelSlotRow, PinnedSlotRow, AllocationRow } from "./project.repository";
import { consultantRepo } from "../consultants/consultant.repository";
import { simulationService } from "../simulation/simulation.service";
import { NotFoundError, ConflictError } from "../../lib/errors";

function toDateStr(d: any): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).slice(0, 10);
}

function projectToDTO(
  row: ProjectRow,
  levelSlots: LevelSlotRow[],
  pinnedSlots: PinnedSlotRow[],
  allocations: AllocationRow[],
) {
  return {
    id:        row.id,
    acronym:   row.acronym,
    client:    row.client,
    status:    row.status,
    startDate: toDateStr(row.start_date),
    endDate:   toDateStr(row.end_date),
    cadence:   row.cadence,
    visitDays: row.visit_days,
    leaderConsultantId: row.leader_consultant_id ?? null,
    notes:     row.notes ?? null,
    levelSlots: levelSlots.map((s) => ({
      id:                    s.id,
      level:                 s.level,
      isLeader:              s.is_leader,
      daysPerWeek:           s.days_per_week,
      visitDays:             s.visit_days,
      assignedConsultantId:  s.assigned_consultant_id,
      assignedDays:          s.assigned_days,
    })),
    pinnedSlots: pinnedSlots.map((s) => ({
      id:           s.id,
      consultantId: s.consultant_id,
      daysPerWeek:  s.days_per_week,
      visitDays:    s.visit_days,
      assignedDays: s.assigned_days,
      cadence:      s.cadence ?? null,
    })),
    allocations: allocations.map((a) => ({
      id:           a.id,
      consultantId: a.consultant_id,
      weekday:      a.weekday,
      role:         a.role,
    })),
    allocatedConsultants: [...new Set(allocations.map((a) => a.consultant_id))],
  };
}

/**
 * Run simulation for a project and merge the proposed allocations with any
 * existing ones (e.g. from pinned slots already allocated).
 * Safe to call even when all slots are already filled — simulation returns
 * an empty proposed list and nothing changes.
 */
async function autoSimulateAndAllocate(projectId: number, cadence: string) {
  const simResults = await simulationService.simulateBatch([projectId]);
  const result = simResults[projectId];
  if (!result?.proposed.length) return;

  const existingAllocs = await projectRepo.getAllocations(projectId);

  // Merge: existing allocations + newly proposed (deduplicated by consultant+weekday)
  const merged = new Map<string, { consultant_id: number; weekday: number; role: string }>();
  for (const a of existingAllocs) {
    merged.set(`${a.consultant_id}-${a.weekday}`, { consultant_id: a.consultant_id, weekday: a.weekday, role: a.role });
  }
  for (const p of result.proposed) {
    merged.set(`${p.consultantId}-${p.weekday}`, { consultant_id: p.consultantId, weekday: p.weekday, role: p.role });
  }

  if (merged.size > 0) {
    await projectRepo.setAllocations(projectId, Array.from(merged.values()), cadence);
  }
}

/** Create allocation records for any pinned slot that has explicit visit days. */
async function autoAllocatePinnedSlots(
  projectId: number,
  pinnedSlots: { consultantId: number; daysPerWeek: number; visitDays: number[] }[],
  cadence: string,
) {
  const withDays = pinnedSlots.filter((s) => s.visitDays.length > 0);
  if (!withDays.length) return;

  const project = await projectRepo.findById(projectId);
  const designatedLeaderId = project?.leader_consultant_id ?? null;

  const dbAllocations: { consultant_id: number; weekday: number; role: string }[] = [];
  for (const slot of withDays) {
    const role = designatedLeaderId === slot.consultantId ? "lider" : "consultor";
    for (const day of slot.visitDays.slice(0, slot.daysPerWeek)) {
      dbAllocations.push({ consultant_id: slot.consultantId, weekday: day, role });
    }
  }

  if (dbAllocations.length > 0) {
    await projectRepo.setAllocations(projectId, dbAllocations, cadence);
  }
}

async function getFullProject(id: number) {
  const row = await projectRepo.findById(id);
  if (!row) throw new NotFoundError("Projeto", id);

  const [levelSlots, pinnedSlots, allocations] = await Promise.all([
    projectRepo.getLevelSlots(id),
    projectRepo.getPinnedSlots(id),
    projectRepo.getAllocations(id),
  ]);

  return projectToDTO(row, levelSlots, pinnedSlots, allocations);
}

export const projectService = {
  async getAll() {
    const { projects, levelSlots, pinnedSlots, allocations } =
      await projectRepo.findAllWithRelations();
    return projects.map((row) =>
      projectToDTO(
        row,
        levelSlots.filter((s) => s.project_id === row.id),
        pinnedSlots.filter((s) => s.project_id === row.id),
        allocations.filter((a) => a.project_id === row.id),
      )
    );
  },

  async getById(id: number) {
    return getFullProject(id);
  },

  async create(data: {
    acronym: string; client: string; status?: string;
    startDate: string; endDate: string; cadence?: string;
    notes?: string | null;
    levelSlots?: { level: string; isLeader: boolean; daysPerWeek: number; visitDays: number[] }[];
    pinnedSlots?: { consultantId: number; daysPerWeek: number; visitDays: number[]; cadence?: string | null }[];
  }) {
    const existing = await projectRepo.findByAcronymAndClient(data.acronym, data.client);
    if (existing) throw new ConflictError(`Projeto ${data.acronym} já existe para o cliente ${data.client}`);

    const row = await projectRepo.create({
      acronym:    data.acronym,
      client:     data.client,
      status:     data.status ?? "cold",
      start_date: data.startDate,
      end_date:   data.endDate,
      cadence:    data.cadence ?? "weekly",
      visit_days: [],
      notes:      data.notes,
    });

    try {
      // Insert level slots
      for (const slot of (data.levelSlots ?? [])) {
        await projectRepo.addLevelSlot(row.id, {
          level:         slot.level,
          is_leader:     slot.isLeader,
          days_per_week: slot.daysPerWeek,
          visit_days:    slot.visitDays,
        });
      }

      // Insert pinned slots
      for (const slot of (data.pinnedSlots ?? [])) {
        await projectRepo.addPinnedSlot(row.id, {
          consultant_id: slot.consultantId,
          days_per_week: slot.daysPerWeek,
          visit_days:    slot.visitDays,
          cadence:       slot.cadence ?? null,
        });
      }

      // Best-effort: allocation conflicts don't block project creation
      try {
        await autoAllocatePinnedSlots(row.id, data.pinnedSlots ?? [], data.cadence ?? "weekly");
      } catch (err: any) {
        console.warn(`[create] autoAllocatePinnedSlots failed for ${row.id}:`, err.message);
      }

      if ((data.status ?? "cold") === "confirmed") {
        try {
          await autoSimulateAndAllocate(row.id, data.cadence ?? "weekly");
        } catch (err: any) {
          console.warn(`[create] autoSimulateAndAllocate failed for ${row.id}:`, err.message);
        }
      }
    } catch (err) {
      // Structural failure — rollback by deleting the just-created project
      await projectRepo.remove(row.id).catch(() => {});
      throw err;
    }

    return getFullProject(row.id);
  },

  async update(id: number, data: Partial<{
    acronym: string; client: string; status: string;
    startDate: string; endDate: string; cadence: string;
    leaderConsultantId: number | null; notes: string | null;
    levelSlots: { level: string; isLeader: boolean; daysPerWeek: number; visitDays: number[] }[];
    pinnedSlots: { consultantId: number; daysPerWeek: number; visitDays: number[]; cadence?: string | null }[];
  }>) {
    const existing = await projectRepo.findById(id);
    if (!existing) throw new NotFoundError("Projeto", id);

    const fields: Parameters<typeof projectRepo.updateFull>[1] = {
      acronym:    data.acronym,
      client:     data.client,
      status:     data.status,
      start_date: data.startDate,
      end_date:   data.endDate,
      cadence:    data.cadence,
      ...("leaderConsultantId" in data ? { leader_consultant_id: data.leaderConsultantId ?? null } : {}),
      ...("notes" in data ? { notes: data.notes ?? null } : {}),
    };

    const slots = (data.levelSlots !== undefined || data.pinnedSlots !== undefined)
      ? {
          levelSlots: (data.levelSlots ?? []).map((s) => ({
            level:         s.level,
            is_leader:     s.isLeader,
            days_per_week: s.daysPerWeek,
            visit_days:    s.visitDays,
          })),
          pinnedSlots: (data.pinnedSlots ?? []).map((s) => ({
            consultant_id: s.consultantId,
            days_per_week: s.daysPerWeek,
            visit_days:    s.visitDays,
            cadence:       s.cadence ?? null,
          })),
        }
      : undefined;

    await projectRepo.updateFull(id, fields, slots);

    const project = await projectRepo.findById(id);
    const cadence = data.cadence ?? project?.cadence ?? "weekly";

    // Best-effort: allocation conflicts don't block project updates
    if (slots) {
      try {
        await autoAllocatePinnedSlots(id, data.pinnedSlots ?? [], cadence);
      } catch (err: any) {
        console.warn(`[update] autoAllocatePinnedSlots failed for ${id}:`, err.message);
      }
    }

    // Only auto-simulate when the project is TRANSITIONING to confirmed (e.g. hot → confirmed).
    // Skip when it was already confirmed — that means we're doing a metadata-only edit or
    // re-confirming after an explicit setAllocations call, and running the simulator would
    // overwrite the allocations that were just set.
    if (data.status === "confirmed" && existing.status !== "confirmed") {
      try {
        await autoSimulateAndAllocate(id, cadence);
      } catch (err: any) {
        console.warn(`[update] autoSimulateAndAllocate failed for ${id}:`, err.message);
      }
    }

    return getFullProject(id);
  },

  async remove(id: number) {
    const deleted = await projectRepo.remove(id);
    if (!deleted) throw new NotFoundError("Projeto", id);
  },

  /** Set allocations with one-consultant-per-day enforcement. */
  async setAllocations(
    projectId: number,
    allocations: { consultantId: number; weekday: number; role: string }[],
  ) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError("Projeto", projectId);

    const dbAllocations = allocations.map((a) => ({
      consultant_id: a.consultantId,
      weekday:       a.weekday,
      role:          a.role,
    }));

    await projectRepo.setAllocations(projectId, dbAllocations, project.cadence);
    return getFullProject(projectId);
  },

  async clearAllocations(projectId: number) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError("Projeto", projectId);
    await projectRepo.removeAllocations(projectId);
    return getFullProject(projectId);
  },
};
