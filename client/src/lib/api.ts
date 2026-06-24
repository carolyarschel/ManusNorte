import type {
  Consultant, Project, Absence,
  LevelSlot, PinnedSlot, Allocation,
  Cadence,
} from "../types";

const BASE = "/api";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  // 204 No Content — body is empty, nothing to parse
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

// ── Consultants ──────────────────────────────────────────────────────────────

export const api = {
  consultants: {
    list: () => req<Consultant[]>("/consultants"),
    get: (id: number) => req<Consultant>(`/consultants/${id}`),
    create: (data: Omit<Consultant, "id">) =>
      req<Consultant>("/consultants", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<Consultant, "id">>) =>
      req<Consultant>(`/consultants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: number) => req<void>(`/consultants/${id}`, { method: "DELETE" }),
    busyDays: (id: number) =>
      req<number[]>(`/consultants/${id}/busy`),
  },

  projects: {
    listWithRelations: () =>
      req<{
        projects: Project[];
        levelSlots: LevelSlot[];
        pinnedSlots: PinnedSlot[];
        allocations: Allocation[];
      }>("/projects?include=relations"),
    get: (id: number) => req<Project>(`/projects/${id}`),
    create: (data: {
      acronym: string; client: string; status: string;
      startDate: string; endDate: string; cadence: Cadence;
      visitDays?: number[]; notes?: string | null;
      levelSlots?: { level: string; isLeader: boolean; daysPerWeek: number; visitDays: number[] }[];
      pinnedSlots?: { consultantId: number; daysPerWeek: number; visitDays: number[]; cadence?: string | null }[];
    }) => req<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{
      acronym: string; client: string; status: string;
      startDate: string; endDate: string; cadence: Cadence;
      visitDays: number[]; leaderConsultantId: number | null; notes: string | null;
      levelSlots: { level: string; isLeader: boolean; daysPerWeek: number; visitDays: number[] }[];
      pinnedSlots: { consultantId: number; daysPerWeek: number; visitDays: number[]; cadence?: string | null }[];
    }>) => req<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    updateFull: (id: number, data: {
      fields: Partial<{
        acronym: string; client: string; status: string;
        startDate: string; endDate: string; cadence: Cadence;
        leaderConsultantId: number | null; notes: string | null;
      }>;
      slots?: {
        levelSlots: { level: string; isLeader: boolean; daysPerWeek: number; visitDays: number[] }[];
        pinnedSlots: { consultantId: number; daysPerWeek: number; visitDays: number[]; cadence?: string | null }[];
      };
    }) => req<Project>(`/projects/${id}/full`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => req<void>(`/projects/${id}`, { method: "DELETE" }),

    // Slots
    addLevelSlot: (projectId: number, data: {
      level: string; isLeader: boolean; daysPerWeek: number; visitDays: number[];
    }) => req<LevelSlot>(`/projects/${projectId}/level-slots`, { method: "POST", body: JSON.stringify(data) }),
    removeLevelSlot: (projectId: number, slotId: number) =>
      req<void>(`/projects/${projectId}/level-slots/${slotId}`, { method: "DELETE" }),

    addPinnedSlot: (projectId: number, data: {
      consultantId: number; daysPerWeek: number; visitDays: number[]; cadence?: string | null;
    }) => req<PinnedSlot>(`/projects/${projectId}/pinned-slots`, { method: "POST", body: JSON.stringify(data) }),
    removePinnedSlot: (projectId: number, slotId: number) =>
      req<void>(`/projects/${projectId}/pinned-slots/${slotId}`, { method: "DELETE" }),

    // Allocations
    setAllocations: (projectId: number, allocations: { consultantId: number; weekday: number; role: string }[]) =>
      req<{ success: boolean }>(`/projects/${projectId}/allocations`, { method: "POST", body: JSON.stringify({ allocations }) }),
    removeAllocations: (projectId: number) =>
      req<void>(`/projects/${projectId}/allocations`, { method: "DELETE" }),
  },

  absences: {
    list: () => req<Absence[]>("/absences"),
    listByConsultant: (id: number) => req<Absence[]>(`/absences/consultant/${id}`),
    create: (data: Omit<Absence, "id">) =>
      req<Absence>("/absences", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<Absence, "id">>) =>
      req<Absence>(`/absences/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: number) => req<void>(`/absences/${id}`, { method: "DELETE" }),
  },

  simulation: {
    run: (data: {
      projectIds: number[];
    }) => req<SimulationResult>("/simulation", { method: "POST", body: JSON.stringify(data) }),
  },
};

export interface SimulationResult {
  results: {
    projectId: number;
    feasible: boolean;
    allocations: { consultantId: number; weekday: number; role: string }[];
    issues: string[];
    suggestions: string[];
    warnings: string[];
    suggestedStartDate?: string | null;
  }[];
  warnings?: string[];
}
