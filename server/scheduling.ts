/**
 * Scheduling service — suggests start dates for hot/cold projects
 * based on team availability.
 */
import { consultantDb, projectDb, allocationDb } from "./db";
import type { Project } from "../drizzle/schema";

function toDateStr(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return toDateStr(d);
}

function nextMonday(from: string): string {
  const d = new Date(from);
  const day = d.getDay(); // 0=sun, 1=mon...
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return toDateStr(d);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

const LEVEL_RANK: Record<string, number> = { junior: 1, pleno: 2, senior: 3 };
const WEEKDAYS = [1, 2, 3, 4, 5];

export type ScheduleResult = {
  projectId: number;
  acronym: string;
  suggestedStartDate: string | null;
  suggestedEndDate: string | null;
  feasible: boolean;
  reason: string;
};

export const schedulingService = {
  async schedule(projectIds: number[]): Promise<ScheduleResult[]> {
    const allConsultants = await consultantDb.findAll();
    const allProjects = await projectDb.findAll();

    // Build existing committed slots from confirmed projects
    const committedSlots: Array<{
      consultantId: number;
      weekday: number;
      cadence: string;
      startDate: string;
      endDate: string;
    }> = [];

    for (const p of allProjects) {
      if (p.status !== "confirmed") continue;
      if (projectIds.includes(p.id)) continue;
      const allocs = await allocationDb.findByProject(p.id);
      for (const a of allocs) {
        committedSlots.push({
          consultantId: a.consultantId,
          weekday: a.weekday,
          cadence: p.cadence,
          startDate: toDateStr(p.startDate),
          endDate: toDateStr(p.endDate),
        });
      }
    }

    const results: ScheduleResult[] = [];

    for (const projectId of projectIds) {
      const project = allProjects.find((p) => p.id === projectId);
      if (!project) {
        results.push({ projectId, acronym: "?", suggestedStartDate: null, suggestedEndDate: null, feasible: false, reason: "Projeto não encontrado" });
        continue;
      }

      const levelSlots = await projectDb.getLevelSlots(project.id);
      const pinnedSlots = await projectDb.getPinnedSlots(project.id);

      if (!levelSlots.length && !pinnedSlots.length) {
        results.push({ projectId, acronym: project.acronym, suggestedStartDate: null, suggestedEndDate: null, feasible: false, reason: "Projeto sem slots definidos" });
        continue;
      }

      const duration = Math.round((new Date(toDateStr(project.endDate)).getTime() - new Date(toDateStr(project.startDate)).getTime()) / (7 * 86400000));

      // Try up to 24 weeks from today
      const today = toDateStr(new Date());
      let found = false;

      for (let w = 0; w <= 24; w++) {
        const candidateStart = nextMonday(addWeeks(today, w));
        const candidateEnd = addWeeks(candidateStart, Math.max(duration, 1));

        let canFill = true;
        const localCommitted = [...committedSlots];

        for (const ls of levelSlots) {
          const eligible = allConsultants.filter((c) => {
            if ((LEVEL_RANK[c.level] ?? 0) < (LEVEL_RANK[ls.level] ?? 0)) return false;
            if (ls.isLeader && !c.isLeader) return false;
            const restrictions = (c.restrictions as number[]) ?? [];
            const busyDays = new Set(
              localCommitted
                .filter((s) => s.consultantId === c.id && overlaps(candidateStart, candidateEnd, s.startDate, s.endDate))
                .map((s) => s.weekday)
            );
            const available = WEEKDAYS.filter((d) => !busyDays.has(d) && !restrictions.includes(d));
            return available.length >= ls.daysPerWeek;
          });

          if (!eligible.length) { canFill = false; break; }

          // Reserve the first eligible consultant
          const chosen = eligible[0];
          const restrictions = (chosen.restrictions as number[]) ?? [];
          const busyDays = new Set(
            localCommitted
              .filter((s) => s.consultantId === chosen.id && overlaps(candidateStart, candidateEnd, s.startDate, s.endDate))
              .map((s) => s.weekday)
          );
          const available = WEEKDAYS.filter((d) => !busyDays.has(d) && !restrictions.includes(d)).slice(0, ls.daysPerWeek);
          for (const d of available) {
            localCommitted.push({ consultantId: chosen.id, weekday: d, cadence: project.cadence, startDate: candidateStart, endDate: candidateEnd });
          }
        }

        if (canFill) {
          results.push({
            projectId,
            acronym: project.acronym,
            suggestedStartDate: candidateStart,
            suggestedEndDate: candidateEnd,
            feasible: true,
            reason: `Equipe disponível a partir de ${candidateStart}`,
          });
          // Add to committed for subsequent projects
          for (const slot of localCommitted.slice(committedSlots.length)) {
            committedSlots.push(slot);
          }
          found = true;
          break;
        }
      }

      if (!found) {
        results.push({
          projectId,
          acronym: project.acronym,
          suggestedStartDate: null,
          suggestedEndDate: null,
          feasible: false,
          reason: "Não foi possível encontrar janela disponível nas próximas 24 semanas",
        });
      }
    }

    return results;
  },
};
