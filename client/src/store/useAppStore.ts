import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Consultant, Project, Absence, Allocation, LevelSlot, PinnedSlot } from "../types";
import { api } from "../lib/api";

interface AppState {
  consultants: Consultant[];
  projects: Project[];
  absences: Absence[];
  loading: boolean;
  error: string | null;

  // Actions
  loadAll: () => Promise<void>;
  loadAbsences: () => Promise<void>;

  // Consultants
  addConsultant: (data: Omit<Consultant, "id">) => Promise<void>;
  updateConsultant: (id: number, data: Partial<Omit<Consultant, "id">>) => Promise<void>;
  removeConsultant: (id: number) => Promise<void>;

  // Projects
  addProject: (data: Omit<Project, "id" | "levelSlots" | "pinnedSlots" | "allocations" | "allocatedConsultants" | "visitDays">) => Promise<void>;
  updateProject: (id: number, data: Partial<Omit<Project, "id" | "levelSlots" | "pinnedSlots" | "allocations" | "allocatedConsultants">>) => Promise<void>;
  updateProjectFull: (id: number, data: Parameters<typeof api.projects.updateFull>[1]) => Promise<void>;
  removeProject: (id: number) => Promise<void>;

  // Allocations
  setAllocations: (projectId: number, allocations: { consultantId: number; weekday: number; role: string }[]) => Promise<void>;
  removeAllocations: (projectId: number) => Promise<void>;

  // Absences
  addAbsence: (data: Omit<Absence, "id">) => Promise<void>;
  updateAbsence: (id: number, data: Partial<Omit<Absence, "id">>) => Promise<void>;
  removeAbsence: (id: number) => Promise<void>;
}

function rowToConsultant(r: Record<string, unknown>): Consultant {
  return {
    id: r.id as number,
    name: r.name as string,
    level: r.level as Consultant["level"],
    isLeader: (r.isLeader ?? r.is_leader) as boolean,
    maxDays: (r.maxDays ?? r.max_days) as number,
    restrictions: ((r.restrictions as number[]) ?? []) as Consultant["restrictions"],
    notes: (r.notes as string | null) ?? null,
  };
}

function rowToProject(r: Record<string, unknown>, allLevelSlots: LevelSlot[], allPinnedSlots: PinnedSlot[], allAllocations: Allocation[]): Project {
  const id = r.id as number;
  const levelSlots = allLevelSlots.filter((s) => s.projectId === id);
  const pinnedSlots = allPinnedSlots.filter((s) => s.projectId === id);
  const allocations = allAllocations.filter((a) => a.projectId === id);
    const allocatedConsultants = Array.from(new Set(allocations.map((a) => a.consultantId)));
  return {
    id,
    acronym: r.acronym as string,
    client: r.client as string,
    status: r.status as Project["status"],
    startDate: (r.startDate ?? r.start_date) as string,
    endDate: (r.endDate ?? r.end_date) as string,
    cadence: (r.cadence ?? "weekly") as Project["cadence"],
    visitDays: (r.visitDays ?? r.visit_days ?? []) as number[],
    leaderConsultantId: ((r.leaderConsultantId ?? r.leader_consultant_id) as number | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    levelSlots,
    pinnedSlots,
    allocations,
    allocatedConsultants,
  };
}

function rowToLevelSlot(r: Record<string, unknown>): LevelSlot {
  return {
    id: r.id as number,
    projectId: (r.projectId ?? r.project_id) as number,
    level: r.level as LevelSlot["level"],
    isLeader: (r.isLeader ?? r.is_leader) as boolean,
    daysPerWeek: (r.daysPerWeek ?? r.days_per_week) as number,
    visitDays: (r.visitDays ?? r.visit_days ?? []) as number[],
    assignedConsultantId: ((r.assignedConsultantId ?? r.assigned_consultant_id) as number | null) ?? null,
    assignedDays: (r.assignedDays ?? r.assigned_days ?? []) as number[],
  };
}

function rowToPinnedSlot(r: Record<string, unknown>): PinnedSlot {
  return {
    id: r.id as number,
    projectId: (r.projectId ?? r.project_id) as number,
    consultantId: (r.consultantId ?? r.consultant_id) as number,
    daysPerWeek: (r.daysPerWeek ?? r.days_per_week) as number,
    visitDays: (r.visitDays ?? r.visit_days ?? []) as number[],
    assignedDays: (r.assignedDays ?? r.assigned_days ?? []) as number[],
    cadence: (r.cadence as string | null) ?? null,
  };
}

function rowToAllocation(r: Record<string, unknown>): Allocation {
  return {
    id: r.id as number,
    projectId: (r.projectId ?? r.project_id) as number,
    consultantId: (r.consultantId ?? r.consultant_id) as number,
    weekday: r.weekday as number,
    role: r.role as string,
  };
}

function rowToAbsence(r: Record<string, unknown>): Absence {
  return {
    id: r.id as number,
    consultantId: (r.consultantId ?? r.consultant_id) as number,
    startDate: (r.startDate ?? r.start_date) as string,
    endDate: (r.endDate ?? r.end_date) as string,
    reason: (r.reason as string | null) ?? null,
  };
}

export const useAppStore = create<AppState>()(
  immer((set, get) => ({
    consultants: [],
    projects: [],
    absences: [],
    loading: false,
    error: null,

    loadAll: async () => {
      set((s) => { s.loading = true; s.error = null; });
      try {
        const [consultantsRaw, relationsRaw] = await Promise.all([
          api.consultants.list(),
          api.projects.listWithRelations(),
        ]);
        const consultants = (consultantsRaw as unknown as Record<string, unknown>[]).map(rowToConsultant);
        const levelSlots = (relationsRaw.levelSlots as unknown as Record<string, unknown>[]).map(rowToLevelSlot);
        const pinnedSlots = (relationsRaw.pinnedSlots as unknown as Record<string, unknown>[]).map(rowToPinnedSlot);
        const allocations = (relationsRaw.allocations as unknown as Record<string, unknown>[]).map(rowToAllocation);
        const projects = (relationsRaw.projects as unknown as Record<string, unknown>[]).map((r) =>
          rowToProject(r, levelSlots, pinnedSlots, allocations)
        );
        set((s) => { s.consultants = consultants; s.projects = projects; s.loading = false; });
      } catch (e) {
        set((s) => { s.error = String(e); s.loading = false; });
      }
    },

    loadAbsences: async () => {
      try {
        const raw = await api.absences.list();
        const absences = (raw as unknown as Record<string, unknown>[]).map(rowToAbsence);
        set((s) => { s.absences = absences; });
      } catch (e) {
        set((s) => { s.error = String(e); });
      }
    },

    // ── Consultants ──────────────────────────────────────────────────────────
    addConsultant: async (data) => {
      const raw = await api.consultants.create(data);
      const c = rowToConsultant(raw as unknown as Record<string, unknown>);
      set((s) => { s.consultants.push(c); });
    },

    updateConsultant: async (id, data) => {
      const raw = await api.consultants.update(id, data);
      const c = rowToConsultant(raw as unknown as Record<string, unknown>);
      set((s) => {
        const idx = s.consultants.findIndex((x) => x.id === id);
        if (idx >= 0) s.consultants[idx] = c;
      });
    },

    removeConsultant: async (id) => {
      await api.consultants.remove(id);
      set((s) => { s.consultants = s.consultants.filter((c) => c.id !== id); });
    },

    // ── Projects ─────────────────────────────────────────────────────────────
    addProject: async (data) => {
      await api.projects.create({
        acronym: data.acronym,
        client: data.client,
        status: data.status,
        startDate: data.startDate,
        endDate: data.endDate,
        cadence: data.cadence,
        visitDays: [],
        notes: data.notes,
      });
      await get().loadAll();
    },

    updateProject: async (id, data) => {
      await api.projects.update(id, data);
      await get().loadAll();
    },

    updateProjectFull: async (id, data) => {
      await api.projects.updateFull(id, data);
      await get().loadAll();
    },

    removeProject: async (id) => {
      await api.projects.remove(id);
      set((s) => { s.projects = s.projects.filter((p) => p.id !== id); });
    },

    // ── Allocations ──────────────────────────────────────────────────────────
    setAllocations: async (projectId, allocations) => {
      await api.projects.setAllocations(projectId, allocations);
      await get().loadAll();
    },

    removeAllocations: async (projectId) => {
      await api.projects.removeAllocations(projectId);
      await get().loadAll();
    },

    // ── Absences ─────────────────────────────────────────────────────────────
    addAbsence: async (data) => {
      const raw = await api.absences.create(data);
      const a = rowToAbsence(raw as unknown as Record<string, unknown>);
      set((s) => { s.absences.push(a); });
    },

    updateAbsence: async (id, data) => {
      const raw = await api.absences.update(id, data);
      const a = rowToAbsence(raw as unknown as Record<string, unknown>);
      set((s) => {
        const idx = s.absences.findIndex((x) => x.id === id);
        if (idx >= 0) s.absences[idx] = a;
      });
    },

    removeAbsence: async (id) => {
      await api.absences.remove(id);
      set((s) => { s.absences = s.absences.filter((a) => a.id !== id); });
    },
  }))
);
