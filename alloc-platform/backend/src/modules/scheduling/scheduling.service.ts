import { projectRepo, LevelSlotRow } from "../projects/project.repository";
import { consultantRepo, ConsultantRow } from "../consultants/consultant.repository";
import { simulationService, SimResult } from "../simulation/simulation.service";
import { toDateStr } from "../../lib/dates";

// ─── Scoring constants ────────────────────────────────────────────────────────

const STATUS_SCORE: Record<string, number> = {
  hot:  20,
  cold: 10,
};

// Penalty per slot with zero eligible consultants
const SCARCITY_IMPOSSIBLE = 5;

const LEVEL_RANK: Record<string, number> = { junior: 0, pleno: 1, senior: 2 };
const LEVEL_LABEL: Record<string, string> = { senior: "Sênior", pleno: "Pleno", junior: "Júnior" };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleEntry {
  projectId: number;
  priority: number;
  score: number;
  scoreBreakdown: { status: number; scarcity: number };
  suggestedStartDate: string | null;
  originalStartDate: string;
  weeksDelayed: number;
  /** true if a feasible date was found (original or shifted) */
  canBeScheduled: boolean;
  issues: string[];
  suggestions: string[];
  proposed: {
    consultantId: number;
    consultantName: string;
    weekday: number;
    role: string;
    slotType: string;
    slotDescription: string;
  }[];
  scarcityReason: string;
}

// ─── Scarcity scoring ────────────────────────────────────────────────────────

/**
 * Computes how scarce the consultant pool is for a project's level slots.
 * Higher score = harder to staff = higher scheduling priority.
 *
 * Score per slot = 1 / eligible_count (or SCARCITY_IMPOSSIBLE if 0 eligible).
 */
function computeScarcity(
  levelSlots: LevelSlotRow[],
  allConsultants: ConsultantRow[],
): { score: number; reason: string } {
  if (!levelSlots.length) {
    return { score: 0, reason: "Sem slots de nível definidos" };
  }

  let score = 0;
  const reasons: string[] = [];

  for (const slot of levelSlots) {
    const eligible = allConsultants.filter((c) => {
      if ((LEVEL_RANK[c.level] ?? 0) < (LEVEL_RANK[slot.level] ?? 0)) return false;
      if (slot.is_leader && !c.is_leader) return false;
      return true;
    });

    const count = eligible.length;
    score += count === 0 ? SCARCITY_IMPOSSIBLE : 1 / count;

    const label = `${slot.is_leader ? "líder " : ""}${LEVEL_LABEL[slot.level] ?? slot.level}`;
    reasons.push(`${count} ${label} elegível${count !== 1 ? "is" : ""}`);
  }

  return { score: parseFloat(score.toFixed(3)), reason: reasons.join("; ") };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const schedulingService = {
  /**
   * Score, order, and suggest start dates for a set of hot/cold projects.
   *
   * Priority rules (in order):
   *   1. Status: hot > cold
   *   2. Scarcity: fewer eligible consultants per slot = higher priority
   *
   * For each project the simulation is run in priority order so that
   * higher-priority projects' tentative allocations become constraints
   * for lower-priority ones (same logic as simulateBatch).
   */
  async schedule(projectIds: number[]): Promise<ScheduleEntry[]> {
    const allConsultants = await consultantRepo.findAll();

    // ── 1. Score each project ────────────────────────────────────────────────
    const scored: Array<{
      projectId: number;
      statusScore: number;
      scarcityScore: number;
      scarcityReason: string;
      originalStartDate: string;
    }> = [];

    for (const id of projectIds) {
      const project = await projectRepo.findById(id);

      // Skip confirmed (fixed) and archived
      if (!project) continue;
      if (project.status === "confirmed" || project.status === "archived") continue;

      const levelSlots = await projectRepo.getLevelSlots(id);
      const { score: scarcityScore, reason: scarcityReason } = computeScarcity(
        levelSlots,
        allConsultants,
      );

      scored.push({
        projectId: id,
        statusScore: STATUS_SCORE[project.status] ?? 0,
        scarcityScore,
        scarcityReason,
        originalStartDate: toDateStr(project.start_date),
      });
    }

    if (!scored.length) return [];

    // ── 2. Sort by status first, then scarcity ───────────────────────────────
    scored.sort((a, b) => {
      if (b.statusScore !== a.statusScore) return b.statusScore - a.statusScore;
      return b.scarcityScore - a.scarcityScore;
    });

    const orderedIds = scored.map((s) => s.projectId);

    // ── 3. Run batch simulation in priority order ────────────────────────────
    // simulateBatch already chains tentative allocations from earlier projects
    // into constraints for later ones — so order matters here.
    const simResults = await simulationService.simulateBatch(orderedIds, false);

    // ── 4. Map to ScheduleEntry ──────────────────────────────────────────────
    return scored.map((s, idx) => {
      const sim: SimResult = simResults[s.projectId] ?? {
        feasible: false,
        issues: ["Resultado de simulação não encontrado"],
        suggestions: [],
        proposed: [],
        earliestFeasibleDate: null,
      };

      const suggestedStartDate = sim.feasible
        ? s.originalStartDate
        : sim.earliestFeasibleDate ?? null;

      const weeksDelayed =
        suggestedStartDate && suggestedStartDate !== s.originalStartDate
          ? Math.round(
              (new Date(suggestedStartDate).getTime() - new Date(s.originalStartDate).getTime()) /
                (7 * 86_400_000),
            )
          : 0;

      return {
        projectId: s.projectId,
        priority: idx + 1,
        score: parseFloat((s.statusScore + s.scarcityScore).toFixed(3)),
        scoreBreakdown: { status: s.statusScore, scarcity: s.scarcityScore },
        suggestedStartDate,
        originalStartDate: s.originalStartDate,
        weeksDelayed,
        canBeScheduled: sim.feasible || suggestedStartDate !== null,
        issues: sim.issues,
        suggestions: sim.suggestions,
        proposed: sim.proposed,
        scarcityReason: s.scarcityReason,
      };
    });
  },
};