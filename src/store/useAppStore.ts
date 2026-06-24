"use client";

import { create } from "zustand";
import type { Consultant, Project, Absence } from "@/types";
import { api } from "@/lib/api";

export interface ProposedAllocation {
  consultantId: number;
  consultantName: string;
  weekday: number;
  role: string;
  slotType: "level" | "pinned";
  slotDescription: string;
  cadence?: string;
}

export interface SimulationResult {
  feasible: boolean;
  issues: string[];
  suggestions: string[];
  proposed: ProposedAllocation[];
  earliestFeasibleDate: string | null;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

export interface ScheduleEntry {
  projectId: number;
  priority: number;
  score: number;
  scoreBreakdown: { status: number; scarcity: number };
  suggestedStartDate: string | null;
  originalStartDate: string;
  weeksDelayed: number;
  canBeScheduled: boolean;
  issues: string[];
  suggestions: string[];
  proposed: ProposedAllocation[];
  scarcityReason: string;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppState {
  consultants: Consultant[];
  projects: Project[];
  absences: Absence[];
  loading: boolean;

  fetchAll: () => Promise<void>;

  addAbsence: (data: Omit<Absence, "id">) => Promise<void>;
  updateAbsence: (id: number, data: Partial<Absence>) => Promise<void>;
  removeAbsence: (id: number) => Promise<void>;

  addConsultant: (c: Omit<Consultant, "id">) => Promise<void>;
  updateConsultant: (id: number, data: Partial<Consultant>) => Promise<void>;
  removeConsultant: (id: number) => Promise<void>;

  addProject: (p: Omit<Project, "id">) => Promise<void>;
  updateProject: (id: number, data: Partial<Project>) => Promise<void>;
  removeProject: (id: number) => Promise<void>;
  setProjectStatus: (id: number, status: Project["status"]) => Promise<void>;
  setProjectLeader: (id: number, leaderId: number | null) => Promise<void>;

  /** Batch simulate multiple projects together (order matters). */
  runSimulationBatch: (
    projectIds: number[],
    randomize?: boolean,
    extraCommitted?: { consultantId: number; weekday: number; cadence: string; startDate: string; endDate: string; projectId: number }[],
  ) => Promise<Record<number, SimulationResult>>;

  confirmAndAllocate: (projectId: number, allocations: { consultantId: number; weekday: number; role: string }[]) => Promise<void>;
  clearAllocations: (projectId: number) => Promise<void>;

  /**
   * Score, prioritize, and suggest start dates for a set of hot/cold projects.
   * Confirmed projects are ignored (they're already fixed).
   */
  scheduleProjects: (projectIds: number[]) => Promise<ScheduleEntry[]>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()((set) => ({
  consultants: [],
  projects: [],
  absences: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true });
    try {
      const [consultants, projects, absences] = await Promise.all([
        api.consultants.list(),
        api.projects.list(),
        api.absences.list(),
      ]);
      set({ consultants, projects, absences, loading: false });
    } catch (err) {
      console.error("Failed to fetch data:", err);
      set({ loading: false });
    }
  },

  addAbsence: async (data) => {
    const created = await api.absences.create(data);
    set((s) => ({ absences: [...s.absences, created] }));
  },
  updateAbsence: async (id, data) => {
    const updated = await api.absences.update(id, data);
    set((s) => ({ absences: s.absences.map((a) => (a.id === id ? updated : a)) }));
  },
  removeAbsence: async (id) => {
    await api.absences.remove(id);
    set((s) => ({ absences: s.absences.filter((a) => a.id !== id) }));
  },

  addConsultant: async (c) => {
    const created = await api.consultants.create(c);
    set((s) => ({ consultants: [...s.consultants, created] }));
  },
  updateConsultant: async (id, data) => {
    const updated = await api.consultants.update(id, data);
    set((s) => ({ consultants: s.consultants.map((c) => (c.id === id ? updated : c)) }));
  },
  removeConsultant: async (id) => {
    await api.consultants.remove(id);
    set((s) => ({ consultants: s.consultants.filter((c) => c.id !== id) }));
  },

  addProject: async (p) => {
    const created = await api.projects.create(p);
    set((s) => ({ projects: [...s.projects, created] }));
  },
  updateProject: async (id, data) => {
    const updated = await api.projects.update(id, data);
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }));
  },
  removeProject: async (id) => {
    await api.projects.remove(id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },
  setProjectStatus: async (id, status) => {
    const updated = await api.projects.update(id, { status });
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }));
  },

  setProjectLeader: async (id, leaderId) => {
    const updated = await api.projects.update(id, { leaderConsultantId: leaderId });
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }));
  },

  runSimulationBatch: async (projectIds, randomize = false, extraCommitted = []) => {
    return api.simulation.run(projectIds, randomize, extraCommitted);
  },

  confirmAndAllocate: async (projectId, allocations) => {
    await api.projects.setAllocations(projectId, allocations);
    const leaderAlloc = allocations.find((a) => a.role === "lider");
    const confirmed = await api.projects.update(projectId, {
      status: "confirmed",
      leaderConsultantId: leaderAlloc?.consultantId ?? null,
    });
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? confirmed : p)),
    }));
  },

  clearAllocations: async (projectId) => {
    const updated = await api.projects.clearAllocations(projectId);
    set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? updated : p)) }));
  },

  scheduleProjects: async (projectIds) => {
    return api.scheduling.run(projectIds);
  },
}));