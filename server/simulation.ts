/**
 * Simulation service — ported from the original Express/PostgreSQL backend.
 * Suggests consultant allocations for a list of projects based on availability
 * and constraints (max_days, restrictions, pinned_slots, level_slots).
 */
import { consultantDb, projectDb, allocationDb, absenceDb } from "./db";
import type { Consultant, Project, PinnedSlot, LevelSlot, Absence } from "../drizzle/schema";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ProposedAllocation = {
  consultantId: number;
  weekday: number;
  role: "líder" | "consultor";
};

export type SimResult = {
  feasible: boolean;
  issues: string[];
  suggestions: string[];
  proposed: ProposedAllocation[];
  earliestFeasibleDate: string | null;
};

type CommittedSlot = {
  consultantId: number;
  weekday: number;
  cadence: string;
  startDate: string;
  endDate: string;
  projectId: number;
};

const LEVEL_RANK: Record<string, number> = { junior: 1, pleno: 2, senior: 3 };
const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_NAMES = ["", "seg", "ter", "qua", "qui", "sex"];

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function toDateStr(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return toDateStr(d);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function cadenceConflict(cA: string, cB: string): boolean {
  return !(
    (cA === "biweekly_odd" && cB === "biweekly_even") ||
    (cA === "biweekly_even" && cB === "biweekly_odd")
  );
}

// ── Availability helpers ──────────────────────────────────────────────────────
function consultantBusyDays(
  consultantId: number,
  startDate: string,
  endDate: string,
  projectCadence: string,
  committed: CommittedSlot[],
  existingAllocs: Array<{ consultantId: number; weekday: number; cadence: string; startDate: string; endDate: string; projectId: number }>,
): Set<number> {
  const busy = new Set<number>();
  const all = [
    ...committed,
    ...existingAllocs,
  ];
  for (const slot of all) {
    if (slot.consultantId !== consultantId) continue;
    if (!overlaps(startDate, endDate, slot.startDate, slot.endDate)) continue;
    if (!cadenceConflict(projectCadence, slot.cadence)) continue;
    busy.add(slot.weekday);
  }
  return busy;
}

function consultantUsedDays(
  consultantId: number,
  startDate: string,
  endDate: string,
  committed: CommittedSlot[],
  existingAllocs: Array<{ consultantId: number; weekday: number; cadence: string; startDate: string; endDate: string; projectId: number }>,
): number {
  const daysSet = new Set<number>();
  for (const slot of [...committed, ...existingAllocs]) {
    if (slot.consultantId !== consultantId) continue;
    if (!overlaps(startDate, endDate, slot.startDate, slot.endDate)) continue;
    daysSet.add(slot.weekday);
  }
  return daysSet.size;
}

// ── Core simulation for a single project ─────────────────────────────────────
async function simulateProject(
  project: Project,
  allConsultants: Consultant[],
  allAbsences: Absence[],
  existingAllocs: Array<{ consultantId: number; weekday: number; cadence: string; startDate: string; endDate: string; projectId: number }>,
  committed: CommittedSlot[],
  randomize: boolean,
): Promise<SimResult> {
  const startDate = toDateStr(project.startDate);
  const endDate = toDateStr(project.endDate);
  const cadence = project.cadence;

  const pinnedSlots = await projectDb.getPinnedSlots(project.id);
  const levelSlots = await projectDb.getLevelSlots(project.id);

  const issues: string[] = [];
  const suggestions: string[] = [];
  const proposed: ProposedAllocation[] = [];

  // ── 1. Pinned slots ─────────────────────────────────────────────────────────
  for (const ps of pinnedSlots) {
    const consultant = allConsultants.find((c) => c.id === ps.consultantId);
    if (!consultant) {
      issues.push(`Consultor fixado #${ps.consultantId} não encontrado`);
      continue;
    }
    const restrictions = (consultant.restrictions as number[]) ?? [];
    const busyDays = consultantBusyDays(ps.consultantId, startDate, endDate, cadence, committed, existingAllocs);
    const absenceDays = new Set(
      allAbsences
        .filter((a) => a.consultantId === ps.consultantId && overlaps(startDate, endDate, toDateStr(a.startDate), toDateStr(a.endDate)))
        .flatMap(() => WEEKDAYS) // simplified: mark all weekdays if any absence overlaps
    );

    let preferredDays = (ps.visitDays as number[]) ?? [];
    if (!preferredDays.length) {
      preferredDays = WEEKDAYS.filter((d) => !restrictions.includes(d) && !busyDays.has(d));
    }

    const availableDays = preferredDays.filter((d) => !busyDays.has(d) && !restrictions.includes(d));
    const needed = ps.daysPerWeek;

    if (availableDays.length < needed) {
      issues.push(`${consultant.name} (fixado) não tem dias suficientes disponíveis (precisa ${needed}, tem ${availableDays.length})`);
      if (availableDays.length > 0) {
        for (const d of availableDays.slice(0, needed)) {
          proposed.push({ consultantId: ps.consultantId, weekday: d, role: "consultor" });
        }
      }
    } else {
      const days = randomize ? shuffle(availableDays).slice(0, needed) : availableDays.slice(0, needed);
      for (const d of days) {
        proposed.push({ consultantId: ps.consultantId, weekday: d, role: "consultor" });
      }
    }
  }

  // ── 2. Level slots ──────────────────────────────────────────────────────────
  const pinnedConsultantIds = new Set(pinnedSlots.map((ps) => ps.consultantId));

  for (const ls of levelSlots) {
    const eligible = allConsultants.filter((c) => {
      if (pinnedConsultantIds.has(c.id)) return false;
      if (proposed.some((p) => p.consultantId === c.id)) return false;
      if ((LEVEL_RANK[c.level] ?? 0) < (LEVEL_RANK[ls.level] ?? 0)) return false;
      if (ls.isLeader && !c.isLeader) return false;
      return true;
    });

    if (!eligible.length) {
      const label = `${ls.isLeader ? "líder " : ""}${ls.level}`;
      issues.push(`Nenhum consultor elegível para slot ${label}`);
      suggestions.push(`Considere adicionar um consultor de nível ${ls.level}${ls.isLeader ? " com perfil de líder" : ""}`);
      continue;
    }

    // Score candidates: prefer those with fewer committed days
    const scored = eligible.map((c) => {
      const usedDays = consultantUsedDays(c.id, startDate, endDate, committed, existingAllocs);
      const busyDays = consultantBusyDays(c.id, startDate, endDate, cadence, committed, existingAllocs);
      const restrictions = (c.restrictions as number[]) ?? [];
      const availableDays = WEEKDAYS.filter((d) => !busyDays.has(d) && !restrictions.includes(d));
      return { consultant: c, usedDays, availableDays };
    }).filter((s) => s.availableDays.length >= ls.daysPerWeek);

    if (!scored.length) {
      const label = `${ls.isLeader ? "líder " : ""}${ls.level}`;
      issues.push(`Nenhum consultor elegível tem dias disponíveis suficientes para slot ${label}`);
      continue;
    }

    scored.sort((a, b) => a.usedDays - b.usedDays);
    if (randomize) shuffle(scored);

    const chosen = scored[0];
    const days = randomize
      ? shuffle(chosen.availableDays).slice(0, ls.daysPerWeek)
      : chosen.availableDays.slice(0, ls.daysPerWeek);

    const role: "líder" | "consultor" = ls.isLeader ? "líder" : "consultor";
    for (const d of days) {
      proposed.push({ consultantId: chosen.consultant.id, weekday: d, role });
    }
  }

  const feasible = issues.length === 0 && (pinnedSlots.length + levelSlots.length) > 0 && proposed.length > 0;

  // ── 3. Earliest feasible date (if not feasible) ──────────────────────────────
  let earliestFeasibleDate: string | null = null;
  if (!feasible && issues.length > 0) {
    // Try up to 12 weeks in the future
    for (let w = 1; w <= 12; w++) {
      const newStart = addWeeks(startDate, w);
      const duration = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 86400000));
      const newEnd = addWeeks(endDate, w);
      // Quick check: can all level slots be filled?
      let canFill = true;
      for (const ls of levelSlots) {
        const eligible = allConsultants.filter((c) => {
          if ((LEVEL_RANK[c.level] ?? 0) < (LEVEL_RANK[ls.level] ?? 0)) return false;
          if (ls.isLeader && !c.isLeader) return false;
          const busyDays = consultantBusyDays(c.id, newStart, newEnd, cadence, committed, existingAllocs);
          const restrictions = (c.restrictions as number[]) ?? [];
          const available = WEEKDAYS.filter((d) => !busyDays.has(d) && !restrictions.includes(d));
          return available.length >= ls.daysPerWeek;
        });
        if (!eligible.length) { canFill = false; break; }
      }
      if (canFill) {
        earliestFeasibleDate = newStart;
        break;
      }
    }
  }

  return { feasible, issues, suggestions, proposed, earliestFeasibleDate };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Public API ────────────────────────────────────────────────────────────────
export const simulationService = {
  async simulateBatch(
    projectIds: number[],
    randomize = false,
  ): Promise<Record<number, SimResult>> {
    const allConsultants = await consultantDb.findAll();
    const allAbsences = await absenceDb.findAll();

    // Build existing confirmed allocations as constraints
    const allProjects = await projectDb.findAll();
    const confirmedProjects = allProjects.filter((p) => p.status === "confirmed" && !projectIds.includes(p.id));
    const existingAllocs: CommittedSlot[] = [];
    for (const p of confirmedProjects) {
      const allocs = await projectDb.getAllocations(p.id);
      for (const a of allocs) {
        existingAllocs.push({
          consultantId: a.consultantId,
          weekday: a.weekday,
          cadence: p.cadence,
          startDate: toDateStr(p.startDate),
          endDate: toDateStr(p.endDate),
          projectId: p.id,
        });
      }
    }

    const results: Record<number, SimResult> = {};
    const committed: CommittedSlot[] = [];

    for (const projectId of projectIds) {
      const project = allProjects.find((p) => p.id === projectId);
      if (!project) {
        results[projectId] = { feasible: false, issues: ["Projeto não encontrado"], suggestions: [], proposed: [], earliestFeasibleDate: null };
        continue;
      }

      const result = await simulateProject(project, allConsultants, allAbsences, existingAllocs, committed, randomize);
      results[projectId] = result;

      // Add proposed allocations to committed for subsequent projects
      if (result.proposed.length > 0) {
        for (const p of result.proposed) {
          committed.push({
            consultantId: p.consultantId,
            weekday: p.weekday,
            cadence: project.cadence,
            startDate: toDateStr(project.startDate),
            endDate: toDateStr(project.endDate),
            projectId: project.id,
          });
        }
      }
    }

    return results;
  },
};
