import { query } from "../../config/database";
import { projectRepo } from "../projects/project.repository";
import { consultantRepo, ConsultantRow } from "../consultants/consultant.repository";
import { NotFoundError } from "../../lib/errors";
import { toDateStr } from "../../lib/dates";

const DAY_NAMES: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" };
const CADENCE_SHORT: Record<string, string> = { weekly: "semanal", biweekly_odd: "quinzenal ímpar", biweekly_even: "quinzenal par" };

const LEVEL_LABELS: Record<string, string> = { senior: "Sênior", pleno: "Pleno", junior: "Júnior" };
const ALL_DAYS = [1, 2, 3, 4, 5];
const LEVEL_RANK: Record<string, number> = { junior: 0, pleno: 1, senior: 2 };

function meetsMinLevel(consultantLevel: string, requiredMin: string): boolean {
  return (LEVEL_RANK[consultantLevel] ?? 0) >= (LEVEL_RANK[requiredMin] ?? 0);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Date-aware conflict checking ────────────────────────────────────────────

export interface CommittedEntry {
  consultantId: number;
  weekday: number;
  cadence: string;
  startDate: string;
  endDate: string;
  projectId: number;
}

interface AllocationDbRow {
  consultant_id: number;
  weekday: number;
  cadence: string;
  start_date: Date;
  end_date: Date;
  project_id: number;
}

/** Do two date ranges overlap? */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Are two cadences alternating biweekly (and thus never on the same actual week)? */
function isAlternating(cadenceA: string, cadenceB: string): boolean {
  return (
    (cadenceA === "biweekly_odd" && cadenceB === "biweekly_even") ||
    (cadenceA === "biweekly_even" && cadenceB === "biweekly_odd")
  );
}

/**
 * Returns weekdays that are BLOCKED for a consultant given a target project's dates/cadence.
 * A weekday is blocked only if there's another project that:
 *   1. Uses the same weekday for this consultant
 *   2. Has overlapping date range with the target project
 *   3. Is NOT alternating biweekly with the target project
 */
function getBlockedDays(
  consultantId: number,
  targetProject: { startDate: string; endDate: string; cadence: string },
  allCommitted: CommittedEntry[],
): number[] {
  const blocked = new Set<number>();
  for (const entry of allCommitted) {
    if (entry.consultantId !== consultantId) continue;
    // Check actual date overlap
    if (!rangesOverlap(targetProject.startDate, targetProject.endDate, entry.startDate, entry.endDate)) continue;
    // Check alternating biweekly
    if (isAlternating(targetProject.cadence, entry.cadence)) continue;
    blocked.add(entry.weekday);
  }
  return [...blocked];
}

/** Loads all committed allocations from the database (excluding specific project IDs). */
async function loadCommittedFromDB(excludeProjectIds: number[]): Promise<CommittedEntry[]> {
  const toEntry = (r: AllocationDbRow): CommittedEntry => ({
    consultantId: r.consultant_id,
    weekday:      r.weekday,
    cadence:      r.cadence,
    startDate:    toDateStr(r.start_date),
    endDate:      toDateStr(r.end_date),
    projectId:    r.project_id,
  });

  const SQL = `SELECT a.consultant_id, a.weekday, p.cadence, p.start_date, p.end_date, p.id as project_id
               FROM allocations a JOIN projects p ON a.project_id = p.id
               WHERE p.status != 'archived'`;

  if (excludeProjectIds.length === 0) {
    const rows = await query<AllocationDbRow>(SQL);
    return rows.map(toEntry);
  }

  const placeholders = excludeProjectIds.map((_, i) => `$${i + 1}`).join(",");
  const rows = await query<AllocationDbRow>(
    `${SQL} AND p.id NOT IN (${placeholders})`,
    excludeProjectIds,
  );
  return rows.map(toEntry);
}

// ─── Day picking ─────────────────────────────────────────────────────────────

function pickDays(
  needed: number,
  mustInclude: number[],
  preferred: number[],
  blocked: Set<number>,
  projectUsedDays: number[],
  randomize: boolean,
): number[] {
  const mandatory = mustInclude.filter((d) => !blocked.has(d));
  if (mandatory.length > needed) return mandatory.slice(0, needed);

  const remaining = needed - mandatory.length;
  if (remaining === 0) return mandatory;

  const available = ALL_DAYS.filter((d) => !blocked.has(d) && !mandatory.includes(d));
  let candidates = [
    ...preferred.filter((d) => available.includes(d)),
    ...available.filter((d) => !preferred.includes(d) && projectUsedDays.includes(d)),
    ...available.filter((d) => !preferred.includes(d) && !projectUsedDays.includes(d)),
  ];
  candidates = [...new Set(candidates)];
  if (randomize) candidates = shuffle(candidates);

  return [...mandatory, ...candidates.slice(0, remaining)].sort();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProposedAllocation {
  consultantId: number;
  consultantName: string;
  weekday: number;
  role: string;
  slotType: "level" | "pinned";
  slotDescription: string;
  cadence: string; // effective cadence for this consultant in this project
}

export interface SimResult {
  feasible: boolean;
  issues: string[];
  suggestions: string[];
  proposed: ProposedAllocation[];
  /** If not feasible, the earliest Monday where it becomes feasible (null if not found). */
  earliestFeasibleDate: string | null;
}

// ─── Core simulation ────────────────────────────────────────────────────────

async function runSimulation(
  projectId: number,
  allConsultants: ConsultantRow[],
  committed: CommittedEntry[],
  randomize: boolean,
  projectOverrides?: { startDate?: string; endDate?: string; cadence?: string },
): Promise<SimResult> {
  const project = await projectRepo.findById(projectId);
  if (!project) throw new NotFoundError("Projeto", projectId);

  const startDate = projectOverrides?.startDate ?? toDateStr(project.start_date);
  const endDate   = projectOverrides?.endDate   ?? toDateStr(project.end_date);
  const effectiveCadence = projectOverrides?.cadence ?? project.cadence;

  const targetProject = { startDate, endDate, cadence: effectiveCadence };

  const levelSlots  = await projectRepo.getLevelSlots(projectId);
  const pinnedSlots = await projectRepo.getPinnedSlots(projectId);

  // Effective cadence per pinned consultant (slot override or project default)
  const pinnedCadence = (consultantId: number): string =>
    pinnedSlots.find((s) => s.consultant_id === consultantId)?.cadence ?? effectiveCadence;

  // Load existing allocations for this project.
  // The project is excluded from `committed` (so the simulation can re-run freely),
  // but we must still prevent re-assigning consultants that are already placed.
  const existingAllocations = await projectRepo.getAllocations(projectId);
  const existingConsultantIds = new Set(existingAllocations.map((a) => a.consultant_id));
  const selfCommitted: CommittedEntry[] = existingAllocations.map((a) => ({
    consultantId: a.consultant_id,
    weekday:      a.weekday,
    cadence:      pinnedCadence(a.consultant_id), // per-consultant cadence
    startDate,
    endDate,
    projectId,
  }));
  // Merge: other-project committed + this project's own existing allocations
  const allCommitted = [...committed, ...selfCommitted];

  const issues: string[] = [];
  const suggestions: string[] = [];
  const proposed: ProposedAllocation[] = [];
  const factor = effectiveCadence === "weekly" ? 1 : 0.5;
  const projectUsedDays: number[] = [];

  // Build blocked days per consultant using all committed (incl. self)
  const getBlocked = (cId: number): Set<number> => {
    const consultant = allConsultants.find((c) => c.id === cId);
    const restrictions = consultant?.restrictions ?? [];
    const busy = getBlockedDays(cId, targetProject, allCommitted);
    return new Set([...restrictions, ...busy]);
  };

  // Track tentative load — only count allocations from projects that overlap with this project's
  // date range, so a consultant on a non-overlapping project is not incorrectly penalised.
  const loadMap: Record<number, number> = {};
  for (const c of allConsultants) {
    loadMap[c.id] = allCommitted
      .filter((e) => e.consultantId === c.id && rangesOverlap(targetProject.startDate, targetProject.endDate, e.startDate, e.endDate))
      .reduce((sum, e) => sum + (e.cadence === "weekly" ? 1 : 0.5), 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Resolve LEADERS
  // ═══════════════════════════════════════════════════════════════════════════

  const leaderSlots = levelSlots.filter((s) => s.is_leader);
  const nonLeaderSlots = levelSlots.filter((s) => !s.is_leader);
  const designatedLeaderId = project.leader_consultant_id ?? null;

  // Days of the designated primary leader — set exactly ONCE (from the first leader resolved).
  // All other consultants (including secondary leaders) must include these days whenever possible.
  const primaryLeaderDays: number[] = [];

  function lockPrimaryLeaderDays(days: number[]) {
    if (primaryLeaderDays.length === 0) {
      days.forEach((d) => { if (!primaryLeaderDays.includes(d)) primaryLeaderDays.push(d); });
    }
  }

  // 1a. Pinned leaders — sort so the designated leader's slot is processed first
  const pinnedLeaderSlots = pinnedSlots
    .filter((s) => allConsultants.find((x) => x.id === s.consultant_id)?.is_leader)
    .sort((a, b) => {
      if (a.consultant_id === designatedLeaderId) return -1;
      if (b.consultant_id === designatedLeaderId) return 1;
      return 0;
    });

  for (const slot of pinnedLeaderSlots) {
    const c = allConsultants.find((x) => x.id === slot.consultant_id)!;

    // Already placed — register their days and lock primaryLeaderDays if first
    if (existingConsultantIds.has(c.id)) {
      const existingDays = selfCommitted.filter((e) => e.consultantId === c.id).map((e) => e.weekday);
      existingDays.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
      lockPrimaryLeaderDays(existingDays);
      continue;
    }

    const blocked = getBlocked(c.id);
    // Primary leader picks freely; secondary leaders must include primaryLeaderDays
    const mustInclude = primaryLeaderDays.length > 0 ? primaryLeaderDays : [];
    const days = pickDays(slot.days_per_week, mustInclude, slot.visit_days, blocked, projectUsedDays, randomize);

    const slotCadence = slot.cadence ?? effectiveCadence;
    const slotFactor  = slotCadence === "weekly" ? 1 : 0.5;

    if (days.length < slot.days_per_week) {
      issues.push(`${c.name} (líder pinado): dias insuficientes`);
      continue;
    }
    const cost = days.length * slotFactor;
    if (loadMap[c.id] + cost > c.max_days) {
      issues.push(`${c.name} ficaria acima da capacidade`);
      continue;
    }

    loadMap[c.id] += cost;
    days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
    lockPrimaryLeaderDays(days);

    // "lider" only if this is the explicitly designated project leader;
    // otherwise they're pinned as a regular consultant who happens to be leader-capable.
    const role = (designatedLeaderId === null || c.id === designatedLeaderId) ? "lider" : "consultor";
    for (const d of days) {
      proposed.push({
        consultantId: c.id, consultantName: c.name, weekday: d,
        role, slotType: "pinned",
        slotDescription: `${c.name} (${role === "lider" ? "líder" : "consultor"}${slotCadence !== effectiveCadence ? " · " + CADENCE_SHORT[slotCadence] : ""})`,
        cadence: slotCadence,
      });
    }
  }

  // 1b. Level leader slots
  for (const slot of leaderSlots) {
    const proposedIds = [...new Set(proposed.map((p) => p.consultantId))];
    let candidates = allConsultants.filter((c) => {
      if (!meetsMinLevel(c.level, slot.level)) return false;
      if (!c.is_leader) return false;
      if (proposedIds.includes(c.id)) return false;
      if (existingConsultantIds.has(c.id)) return false;
      return true;
    });

    if (randomize) candidates = shuffle(candidates);
    else candidates.sort((a, b) => {
      const ae = a.level === slot.level ? 0 : 1;
      const be = b.level === slot.level ? 0 : 1;
      return ae !== be ? ae - be : loadMap[a.id] - loadMap[b.id];
    });
    // Designated leader always goes first (before any sorting tie-breaks)
    if (designatedLeaderId) {
      candidates.sort((a, b) => {
        if (a.id === designatedLeaderId) return -1;
        if (b.id === designatedLeaderId) return 1;
        return 0;
      });
    }

    let filled = false;
    for (const c of candidates) {
      const blocked = getBlocked(c.id);
      // Primary leader picks freely; secondary leaders must include primaryLeaderDays
      const mustInclude = primaryLeaderDays.length > 0 ? primaryLeaderDays : [];
      const days = pickDays(slot.days_per_week, mustInclude, slot.visit_days, blocked, projectUsedDays, randomize);
      if (days.length < slot.days_per_week) continue;

      const cost = days.length * factor;
      if (loadMap[c.id] + cost > c.max_days) continue;

      loadMap[c.id] += cost;
      days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
      lockPrimaryLeaderDays(days);

      for (const d of days) {
        proposed.push({
          consultantId: c.id, consultantName: c.name, weekday: d,
          role: "lider", slotType: "level", slotDescription: `Líder ${LEVEL_LABELS[slot.level]}+`,
          cadence: effectiveCadence,
        });
      }
      suggestions.push(`Líder ${LEVEL_LABELS[slot.level]}+: ${c.name} (${LEVEL_LABELS[c.level]}) — ${days.map((d) => DAY_NAMES[d]).join(", ")}`);
      filled = true;
      break;
    }

    if (!filled) issues.push(`Sem líder ${LEVEL_LABELS[slot.level]}+ disponível (${slot.days_per_week}d/sem)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Resolve NON-LEADERS (go on same days as the primary leader)
  // ═══════════════════════════════════════════════════════════════════════════

  // 2a. Pinned non-leaders
  for (const slot of pinnedSlots) {
    const c = allConsultants.find((x) => x.id === slot.consultant_id);
    if (!c || c.is_leader) continue;

    // Already placed — register days and skip
    if (existingConsultantIds.has(c.id)) {
      selfCommitted.filter((e) => e.consultantId === c.id).forEach((e) => {
        if (!projectUsedDays.includes(e.weekday)) projectUsedDays.push(e.weekday);
      });
      continue;
    }

    const blocked = getBlocked(c.id);
    const days = pickDays(slot.days_per_week, primaryLeaderDays, slot.visit_days, blocked, projectUsedDays, randomize);

    const slotCadence = slot.cadence ?? effectiveCadence;
    const slotFactor  = slotCadence === "weekly" ? 1 : 0.5;

    if (days.length < slot.days_per_week) {
      issues.push(`${c.name} (pinado): dias insuficientes`);
      continue;
    }
    const cost = days.length * slotFactor;
    if (loadMap[c.id] + cost > c.max_days) {
      issues.push(`${c.name} ficaria acima da capacidade`);
      continue;
    }

    loadMap[c.id] += cost;
    days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });

    for (const d of days) {
      proposed.push({
        consultantId: c.id, consultantName: c.name, weekday: d,
        role: "consultor", slotType: "pinned",
        slotDescription: `${c.name}${slotCadence !== effectiveCadence ? " · " + CADENCE_SHORT[slotCadence] : ""}`,
        cadence: slotCadence,
      });
    }
  }

  // 2b. Level non-leader slots
  for (const slot of nonLeaderSlots) {
    const proposedIds = [...new Set(proposed.map((p) => p.consultantId))];
    let candidates = allConsultants.filter((c) => {
      if (!meetsMinLevel(c.level, slot.level)) return false;
      if (proposedIds.includes(c.id)) return false;
      if (existingConsultantIds.has(c.id)) return false;
      return true;
    });

    if (randomize) candidates = shuffle(candidates);
    else candidates.sort((a, b) => {
      const ae = a.level === slot.level ? 0 : 1;
      const be = b.level === slot.level ? 0 : 1;
      return ae !== be ? ae - be : loadMap[a.id] - loadMap[b.id];
    });

    let filled = false;
    for (const c of candidates) {
      const blocked = getBlocked(c.id);
      const days = pickDays(slot.days_per_week, primaryLeaderDays, slot.visit_days, blocked, projectUsedDays, randomize);
      if (days.length < slot.days_per_week) continue;

      const cost = days.length * factor;
      if (loadMap[c.id] + cost > c.max_days) continue;

      loadMap[c.id] += cost;
      days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });

      for (const d of days) {
        proposed.push({
          consultantId: c.id, consultantName: c.name, weekday: d,
          role: "consultor", slotType: "level", slotDescription: `${LEVEL_LABELS[slot.level]}+`,
          cadence: effectiveCadence,
        });
      }
      suggestions.push(`${LEVEL_LABELS[slot.level]}+: ${c.name} (${LEVEL_LABELS[c.level]}) — ${days.map((d) => DAY_NAMES[d]).join(", ")}`);
      filled = true;
      break;
    }

    if (!filled) issues.push(`Sem ${LEVEL_LABELS[slot.level]}+ disponível (${slot.days_per_week}d/sem)`);
  }

  return { feasible: issues.length === 0, issues, suggestions, proposed, earliestFeasibleDate: null };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const simulationService = {
  /**
   * Simulate one or more projects together.
   * For each project, considers date-aware conflicts and tentative allocations
   * from previously simulated projects in the batch.
   *
   * @param projectIds - project IDs to simulate (order matters: first = highest priority)
   * @param randomize  - shuffle candidate order for variety
   */
  async simulateBatch(
    projectIds: number[],
    randomize = false,
    extraCommitted: CommittedEntry[] = [],
  ): Promise<Record<number, SimResult>> {
    const allConsultants = await consultantRepo.findAll();
    // Load committed allocations, excluding all projects being simulated.
    // extraCommitted holds proposals from other selected (not yet applied) projects
    // that the caller wants treated as hard constraints for this simulation.
    const committed = [...(await loadCommittedFromDB(projectIds)), ...extraCommitted];
    const results: Record<number, SimResult> = {};

    // ── Pre-load existing DB allocations for every batch project ─────────────
    // When project X is simulated early in the list, it must still see the
    // existing allocations of project Y (simulated later) as hard constraints —
    // otherwise X might freely use days that Y already owns in the DB.
    // We track which projects have already been processed to avoid double-counting
    // their allocations once they enter `tentative`.
    const batchExisting = new Map<number, CommittedEntry[]>();
    for (const pid of projectIds) {
      const proj = await projectRepo.findById(pid);
      if (!proj) continue;
      const sd = toDateStr(proj.start_date);
      const ed = toDateStr(proj.end_date);
      const allocs = await projectRepo.getAllocations(pid);
      batchExisting.set(pid, allocs.map((a) => ({
        consultantId: a.consultant_id,
        weekday:      a.weekday,
        cadence:      proj.cadence,
        startDate:    sd,
        endDate:      ed,
        projectId:    pid,
      })));
    }

    // Running list of allocations from projects already processed in this batch
    const tentative: CommittedEntry[] = [];
    const processedIds = new Set<number>();

    for (const projectId of projectIds) {
      const project = await projectRepo.findById(projectId);
      if (!project) {
        results[projectId] = {
          feasible: false,
          issues: ["Projeto não encontrado"],
          suggestions: [],
          proposed: [],
          earliestFeasibleDate: null,
        };
        continue;
      }

      const startDate = toDateStr(project.start_date);
      const endDate = toDateStr(project.end_date);

      // Constraints = DB base + existing allocs of sibling projects NOT yet processed
      // (once processed, their allocs are in `tentative` — avoid double-counting)
      const siblingExisting: CommittedEntry[] = [];
      for (const [pid, entries] of batchExisting) {
        if (pid !== projectId && !processedIds.has(pid)) {
          siblingExisting.push(...entries);
        }
      }

      const allCommitted = [...committed, ...siblingExisting, ...tentative];

      // Run simulation
      const result = await runSimulation(projectId, allConsultants, allCommitted, randomize);

      // Mark project as processed so its entries aren't duplicated by siblingExisting
      processedIds.add(projectId);

      if (result.feasible) {
        // Add proposed allocations to tentative (per-consultant cadence preserved)
        const proposedSet = new Set(result.proposed.map((a) => `${a.consultantId}-${a.weekday}`));
        for (const alloc of result.proposed) {
          tentative.push({
            consultantId: alloc.consultantId,
            weekday:      alloc.weekday,
            cadence:      alloc.cadence,
            startDate,
            endDate,
            projectId,
          });
        }
        // Also add pre-existing allocations not covered by proposals
        for (const entry of (batchExisting.get(projectId) ?? [])) {
          if (!proposedSet.has(`${entry.consultantId}-${entry.weekday}`)) {
            tentative.push(entry);
          }
        }
      } else {
        // Try to find earliest feasible start date (shift by 1 week at a time, up to 26 weeks)
        const originalDuration = (new Date(endDate).getTime() - new Date(startDate).getTime());

        for (let weeksOffset = 1; weeksOffset <= 26; weeksOffset++) {
          const newStart = new Date(new Date(startDate).getTime() + weeksOffset * 7 * 86400000);
          const newEnd = new Date(newStart.getTime() + originalDuration);
          const newStartStr = newStart.toISOString().split("T")[0];
          const newEndStr = newEnd.toISOString().split("T")[0];

          const retry = await runSimulation(
            projectId, allConsultants, allCommitted, false,
            { startDate: newStartStr, endDate: newEndStr }
          );

          if (retry.feasible) {
            result.earliestFeasibleDate = newStartStr;
            result.suggestions.push(
              `Data mais cedo viável: ${newStartStr} (${weeksOffset} semana${weeksOffset > 1 ? "s" : ""} depois)`
            );
            break;
          }
        }

        // If the project is weekly and still infeasible, also try biweekly cadences
        if (project.cadence === "weekly") {
          for (const bwCadence of ["biweekly_odd", "biweekly_even"] as const) {
            const bwRetry = await runSimulation(
              projectId, allConsultants, allCommitted, false,
              { cadence: bwCadence }
            );
            if (bwRetry.feasible) {
              const label = bwCadence === "biweekly_odd" ? "quinzenal (semanas ímpares)" : "quinzenal (semanas pares)";
              result.suggestions.push(`Alternativa: viável como projeto ${label} na data original`);
              break;
            }
          }
        }
      }

      results[projectId] = result;
    }

    return results;
  },
};
