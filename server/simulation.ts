/**
 * Simulation service — ported faithfully from the original Express/PostgreSQL backend.
 * Logic is kept identical to the original simulation.service.ts.
 */
import { consultantDb, projectDb } from "./db";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ProposedAllocation = {
  consultantId: number;
  consultantName: string;
  weekday: number;
  role: string;
  slotType: "level" | "pinned";
  slotDescription: string;
  cadence: string;
};

export type SimResult = {
  feasible: boolean;
  issues: string[];
  suggestions: string[];
  proposed: ProposedAllocation[];
  earliestFeasibleDate: string | null;
};

type CommittedEntry = {
  consultantId: number;
  weekday: number;
  cadence: string;
  startDate: string;
  endDate: string;
  projectId: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const DAY_NAMES: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" };
const CADENCE_SHORT: Record<string, string> = {
  weekly: "semanal",
  biweekly_odd: "quinzenal ímpar",
  biweekly_even: "quinzenal par",
};
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

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "2000-01-01";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function isAlternating(cadenceA: string, cadenceB: string): boolean {
  return (
    (cadenceA === "biweekly_odd" && cadenceB === "biweekly_even") ||
    (cadenceA === "biweekly_even" && cadenceB === "biweekly_odd")
  );
}

/**
 * Returns weekdays that are BLOCKED for a consultant given a target project's dates/cadence.
 */
function getBlockedDays(
  consultantId: number,
  targetProject: { startDate: string; endDate: string; cadence: string },
  allCommitted: CommittedEntry[],
): number[] {
  const blocked = new Set<number>();
  for (const entry of allCommitted) {
    if (entry.consultantId !== consultantId) continue;
    if (!rangesOverlap(targetProject.startDate, targetProject.endDate, entry.startDate, entry.endDate)) continue;
    if (isAlternating(targetProject.cadence, entry.cadence)) continue;
    blocked.add(entry.weekday);
  }
  return Array.from(blocked);
}

/**
 * Pick `needed` days for a consultant.
 * - First include mandatory days (mustInclude that are not blocked).
 * - Then fill from preferred, then from days already used by the project, then free days.
 */
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
  candidates = Array.from(new Set(candidates));
  if (randomize) candidates = shuffle(candidates);
  return mandatory.concat(candidates.slice(0, remaining)).sort((a, b) => a - b);
}

// ── Core simulation ───────────────────────────────────────────────────────────
async function runSimulation(
  projectId: number,
  allConsultants: Awaited<ReturnType<typeof consultantDb.findAll>>,
  allCommitted: CommittedEntry[],
  randomize: boolean,
  projectOverrides?: { startDate?: string; endDate?: string; cadence?: string },
): Promise<SimResult> {
  const project = await projectDb.findById(projectId);
  if (!project) {
    return { feasible: false, issues: ["Projeto não encontrado"], suggestions: [], proposed: [], earliestFeasibleDate: null };
  }
  const startDate = projectOverrides?.startDate ?? toDateStr(project.startDate);
  const endDate   = projectOverrides?.endDate   ?? toDateStr(project.endDate);
  const effectiveCadence = projectOverrides?.cadence ?? project.cadence;
  const targetProject = { startDate, endDate, cadence: effectiveCadence };
  const levelSlots  = await projectDb.getLevelSlots(projectId);
  const pinnedSlots = await projectDb.getPinnedSlots(projectId);

  // Effective cadence per pinned consultant (slot override or project default)
  const pinnedCadence = (consultantId: number): string =>
    (pinnedSlots.find((s) => s.consultantId === consultantId) as unknown as { cadence?: string })?.cadence ?? effectiveCadence;

  // Load existing allocations for this project
  const existingAllocations = await projectDb.getAllocations(projectId);
  const existingConsultantIds = new Set(existingAllocations.map((a) => a.consultantId));
  const selfCommitted: CommittedEntry[] = existingAllocations.map((a) => ({
    consultantId: a.consultantId,
    weekday:      a.weekday,
    cadence:      pinnedCadence(a.consultantId),
    startDate,
    endDate,
    projectId,
  }));

  // Merge: other-project committed + this project's own existing allocations
  const allCommittedFull = [...allCommitted, ...selfCommitted];

  const issues: string[] = [];
  const suggestions: string[] = [];
  const proposed: ProposedAllocation[] = [];
  const factor = effectiveCadence === "weekly" ? 1 : 0.5;
  const projectUsedDays: number[] = [];
  // Days covered by a Pleno/Sênior consultant in THIS project (for the Júnior pairing rule)
  const seniorPlenoDays: number[] = [];
  const addSeniorPlenoDays = (cId: number, days: number[]) => {
    const lvl = allConsultants.find((x) => x.id === cId)?.level;
    if (lvl === "pleno" || lvl === "senior") {
      days.forEach((d) => { if (!seniorPlenoDays.includes(d)) seniorPlenoDays.push(d); });
    }
  };

  // Build blocked days per consultant using all committed (incl. self)
  const getBlocked = (cId: number): Set<number> => {
    const consultant = allConsultants.find((c) => c.id === cId);
    const restrictions = (consultant?.restrictions as number[]) ?? [];
    const busy = getBlockedDays(cId, targetProject, allCommittedFull);
    return new Set(Array.from(restrictions).concat(Array.from(busy)));
  };

  // Track tentative load — only count allocations from projects that overlap
  const loadMap: Record<number, number> = {};
  for (const c of allConsultants) {
    loadMap[c.id] = allCommittedFull
      .filter((e) =>
        e.consultantId === c.id &&
        rangesOverlap(targetProject.startDate, targetProject.endDate, e.startDate, e.endDate),
      )
      .reduce((sum: number, e) => sum + (e.cadence === "weekly" ? 1 : 0.5), 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Resolve LEADERS
  // ═══════════════════════════════════════════════════════════════════════════
  const leaderSlots    = levelSlots.filter((s) => s.isLeader);
  const nonLeaderSlots = levelSlots.filter((s) => !s.isLeader);
  const designatedLeaderId = (project as unknown as { leaderConsultantId?: number | null }).leaderConsultantId ?? null;

  // Days of the designated primary leader — set exactly ONCE
  const primaryLeaderDays: number[] = [];
  function lockPrimaryLeaderDays(days: number[]) {
    if (primaryLeaderDays.length === 0) {
      days.forEach((d) => { if (!primaryLeaderDays.includes(d)) primaryLeaderDays.push(d); });
    }
  }

  // 1a. Pinned leaders — sort so the designated leader's slot is processed first
  const pinnedLeaderSlots = pinnedSlots
    .filter((s) => allConsultants.find((x) => x.id === s.consultantId)?.isLeader)
    .sort((a, b) => {
      if (a.consultantId === designatedLeaderId) return -1;
      if (b.consultantId === designatedLeaderId) return 1;
      return 0;
    });

  for (const slot of pinnedLeaderSlots) {
    const c = allConsultants.find((x) => x.id === slot.consultantId);
    if (!c) continue;
    if (existingConsultantIds.has(c.id)) {
      const existingDays = selfCommitted.filter((e) => e.consultantId === c.id).map((e) => e.weekday);
      existingDays.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
      lockPrimaryLeaderDays(existingDays);
      addSeniorPlenoDays(c.id, existingDays);
      continue;
    }
    const blocked = getBlocked(c.id);
    const mustInclude = primaryLeaderDays.length > 0 ? primaryLeaderDays : [];
    const slotVisitDays = (slot.visitDays as number[]) ?? [];
    const days = pickDays(slot.daysPerWeek, mustInclude, slotVisitDays, blocked, projectUsedDays, randomize);
    const slotCad = (slot as unknown as { cadence?: string }).cadence ?? effectiveCadence;
    const slotFactor = slotCad === "weekly" ? 1 : 0.5;
    if (days.length < slot.daysPerWeek) {
      issues.push(`${c.name} (líder pinado): dias insuficientes`);
      continue;
    }
    const cost = days.length * slotFactor;
    if (loadMap[c.id] + cost > c.maxDays) {
      issues.push(`${c.name} ficaria acima da capacidade`);
      continue;
    }
    loadMap[c.id] += cost;
    days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
    lockPrimaryLeaderDays(days);
    addSeniorPlenoDays(c.id, days);
    const role = (designatedLeaderId === null || c.id === designatedLeaderId) ? "lider" : "consultor";
    for (const d of days) {
      proposed.push({
        consultantId: c.id, consultantName: c.name, weekday: d,
        role,
        slotType: "pinned",
        slotDescription: `${c.name} (${role === "lider" ? "líder" : "consultor"}${slotCad !== effectiveCadence ? " · " + CADENCE_SHORT[slotCad] : ""})`,
        cadence: slotCad,
      });
    }
  }

  // 1b. Level leader slots
  for (const slot of leaderSlots) {
    const proposedIds = Array.from(new Set(proposed.map((p) => p.consultantId)));
    let candidates = allConsultants.filter((c) => {
      if (!meetsMinLevel(c.level, slot.level)) return false;
      if (!c.isLeader) return false;
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
      const mustInclude = primaryLeaderDays.length > 0 ? primaryLeaderDays : [];
      const slotVisitDays = (slot.visitDays as number[]) ?? [];
      const days = pickDays(slot.daysPerWeek, mustInclude, slotVisitDays, blocked, projectUsedDays, randomize);
      if (days.length < slot.daysPerWeek) continue;
      const cost = days.length * factor;
      if (loadMap[c.id] + cost > c.maxDays) continue;
      loadMap[c.id] += cost;
      days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
      lockPrimaryLeaderDays(days);
      addSeniorPlenoDays(c.id, days);
      for (const d of days) {
        proposed.push({
          consultantId: c.id, consultantName: c.name, weekday: d,
          role: "lider", slotType: "level",
          slotDescription: `Líder ${LEVEL_LABELS[slot.level]}+`,
          cadence: effectiveCadence,
        });
      }
      suggestions.push(`Líder ${LEVEL_LABELS[slot.level]}+: ${c.name} (${LEVEL_LABELS[c.level]}) — ${days.map((d) => DAY_NAMES[d]).join(", ")}`);
      filled = true;
      break;
    }
    if (!filled) issues.push(`Sem líder ${LEVEL_LABELS[slot.level]}+ disponível (${slot.daysPerWeek}d/sem)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Resolve NON-LEADERS
  // ═══════════════════════════════════════════════════════════════════════════

  // 2a. Pinned non-leaders
  const pinnedNonLeaderSlots = pinnedSlots.filter(
    (s) => !allConsultants.find((x) => x.id === s.consultantId)?.isLeader,
  );
  for (const slot of pinnedNonLeaderSlots) {
    const c = allConsultants.find((x) => x.id === slot.consultantId);
    if (!c) continue;
    if (existingConsultantIds.has(c.id)) {
      const existingDays = selfCommitted.filter((e) => e.consultantId === c.id).map((e) => e.weekday);
      existingDays.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
      addSeniorPlenoDays(c.id, existingDays);
      continue;
    }
    const blocked = getBlocked(c.id);
    const mustInclude = primaryLeaderDays.length > 0 ? primaryLeaderDays : [];
    const slotVisitDays = (slot.visitDays as number[]) ?? [];
    const days = pickDays(slot.daysPerWeek, mustInclude, slotVisitDays, blocked, projectUsedDays, randomize);
    const slotCad = (slot as unknown as { cadence?: string }).cadence ?? effectiveCadence;
    const slotFactor = slotCad === "weekly" ? 1 : 0.5;
    if (days.length < slot.daysPerWeek) {
      issues.push(`${c.name} (fixado): dias insuficientes`);
      if (days.length > 0) {
        for (const d of days) {
          proposed.push({
            consultantId: c.id, consultantName: c.name, weekday: d,
            role: "consultor", slotType: "pinned",
            slotDescription: `${c.name}${slotCad !== effectiveCadence ? " · " + CADENCE_SHORT[slotCad] : ""}`,
            cadence: slotCad,
          });
        }
      }
      continue;
    }
    const cost = days.length * slotFactor;
    if (loadMap[c.id] + cost > c.maxDays) {
      issues.push(`${c.name} ficaria acima da capacidade`);
      continue;
    }
    loadMap[c.id] += cost;
    days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
    addSeniorPlenoDays(c.id, days);
    for (const d of days) {
      proposed.push({
        consultantId: c.id, consultantName: c.name, weekday: d,
        role: "consultor", slotType: "pinned",
        slotDescription: `${c.name}${slotCad !== effectiveCadence ? " · " + CADENCE_SHORT[slotCad] : ""}`,
        cadence: slotCad,
      });
    }
  }

  // 2b. Level non-leader slots
  // Process non-Junior slots FIRST so that Pleno/Sênior days are consolidated
  // before applying the Junior pairing rule (a Junior must share ≥1 day with a Pleno/Sênior).
  const orderedNonLeaderSlots = [...nonLeaderSlots].sort((a, b) => {
    const aJr = a.level === "junior" ? 1 : 0;
    const bJr = b.level === "junior" ? 1 : 0;
    return aJr - bJr;
  });
  for (const slot of orderedNonLeaderSlots) {
    const proposedIds = Array.from(new Set(proposed.map((p) => p.consultantId)));
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
    let juniorPairingFailed = false;
    for (const c of candidates) {
      const isJunior = c.level === "junior";
      const blocked = getBlocked(c.id);
      const slotVisitDays = (slot.visitDays as number[]) ?? [];
      // For a Junior, at least one day MUST coincide with a Pleno/Sênior day.
      // Prepend available Pleno/Sênior days as preferred so pickDays favors overlap.
      let preferred = slotVisitDays;
      if (isJunior && seniorPlenoDays.length > 0) {
        const sharable = seniorPlenoDays.filter((d) => !blocked.has(d));
        preferred = Array.from(new Set([...sharable, ...slotVisitDays]));
      }
      const days = pickDays(slot.daysPerWeek, primaryLeaderDays, preferred, blocked, projectUsedDays, randomize);
      if (days.length < slot.daysPerWeek) continue;
      // Enforce the Junior pairing rule.
      if (isJunior) {
        if (seniorPlenoDays.length === 0) {
          juniorPairingFailed = true;
          continue;
        }
        const sharesDay = days.some((d) => seniorPlenoDays.includes(d));
        if (!sharesDay) {
          juniorPairingFailed = true;
          continue;
        }
      }
      const cost = days.length * factor;
      if (loadMap[c.id] + cost > c.maxDays) continue;
      loadMap[c.id] += cost;
      days.forEach((d) => { if (!projectUsedDays.includes(d)) projectUsedDays.push(d); });
      addSeniorPlenoDays(c.id, days);
      for (const d of days) {
        proposed.push({
          consultantId: c.id, consultantName: c.name, weekday: d,
          role: "consultor", slotType: "level",
          slotDescription: `${LEVEL_LABELS[slot.level]}+`,
          cadence: effectiveCadence,
        });
      }
      suggestions.push(`${LEVEL_LABELS[slot.level]}+: ${c.name} (${LEVEL_LABELS[c.level]}) — ${days.map((d) => DAY_NAMES[d]).join(", ")}`);
      filled = true;
      break;
    }
    if (!filled) {
      if (juniorPairingFailed && seniorPlenoDays.length === 0) {
        issues.push(`Júnior (${LEVEL_LABELS[slot.level]}+) precisa de um Pleno/Sênior alocado no mesmo projeto`);
      } else if (juniorPairingFailed) {
        issues.push(`Sem ${LEVEL_LABELS[slot.level]}+ Júnior que compartilhe dia com Pleno/Sênior`);
      } else {
        issues.push(`Sem ${LEVEL_LABELS[slot.level]}+ disponível (${slot.daysPerWeek}d/sem)`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL CHECK: Junior pairing rule across ALL allocation paths
  // Any proposed Junior consultant must share at least one day with a Pleno/Sênior
  // in this project (covers pinned juniors and pre-existing allocations too).
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Collect Pleno/Sênior days from BOTH proposals and pre-existing allocations.
    const plenoSeniorDays = new Set<number>(seniorPlenoDays);
    for (const p of proposed) {
      const lvl = allConsultants.find((c) => c.id === p.consultantId)?.level;
      if (lvl === "pleno" || lvl === "senior") plenoSeniorDays.add(p.weekday);
    }
    for (const a of existingAllocations) {
      const lvl = allConsultants.find((c) => c.id === a.consultantId)?.level;
      if (lvl === "pleno" || lvl === "senior") plenoSeniorDays.add(a.weekday);
    }
    // Group proposed days per Junior consultant.
    const juniorDays = new Map<number, { name: string; days: number[] }>();
    for (const p of proposed) {
      const lvl = allConsultants.find((c) => c.id === p.consultantId)?.level;
      if (lvl !== "junior") continue;
      const entry = juniorDays.get(p.consultantId) ?? { name: p.consultantName, days: [] };
      entry.days.push(p.weekday);
      juniorDays.set(p.consultantId, entry);
    }
    for (const a of existingAllocations) {
      const lvl = allConsultants.find((c) => c.id === a.consultantId)?.level;
      if (lvl !== "junior") continue;
      const c = allConsultants.find((x) => x.id === a.consultantId);
      const entry = juniorDays.get(a.consultantId) ?? { name: c?.name ?? `#${a.consultantId}`, days: [] };
      entry.days.push(a.weekday);
      juniorDays.set(a.consultantId, entry);
    }
    for (const info of Array.from(juniorDays.values())) {
      const shares = info.days.some((d: number) => plenoSeniorDays.has(d));
      if (!shares) {
        issues.push(`${info.name} (Júnior) não compartilha nenhum dia com um Pleno/Sênior`);
      }
    }
  }

  return { feasible: issues.length === 0, issues, suggestions, proposed, earliestFeasibleDate: null };
}

// ── Public API ────────────────────────────────────────────────────────────────
export const simulationService = {
  /**
   * Simulate one or more projects together.
   * For each project, considers date-aware conflicts and tentative allocations
   * from previously simulated projects in the batch.
   */
  async simulateBatch(
    projectIds: number[],
    randomize = false,
    extraCommitted: CommittedEntry[] = [],
  ): Promise<Record<number, SimResult>> {
    const allConsultants = await consultantDb.findAll();

    // Load committed allocations from DB, excluding all projects being simulated
    const allProjects = await projectDb.findAll();
    const baseCommitted: CommittedEntry[] = [];
    for (const p of allProjects) {
      if (projectIds.includes(p.id)) continue;
      if (p.status === "archived") continue;
      const allocs = await projectDb.getAllocations(p.id);
      for (const a of allocs) {
        baseCommitted.push({
          consultantId: a.consultantId,
          weekday:      a.weekday,
          cadence:      p.cadence,
          startDate:    toDateStr(p.startDate),
          endDate:      toDateStr(p.endDate),
          projectId:    p.id,
        });
      }
    }
    const committed = [...baseCommitted, ...extraCommitted];

    // Pre-load existing DB allocations for every batch project
    const batchExisting = new Map<number, CommittedEntry[]>();
    for (const pid of projectIds) {
      const proj = allProjects.find((p) => p.id === pid);
      if (!proj) continue;
      const sd = toDateStr(proj.startDate);
      const ed = toDateStr(proj.endDate);
      const allocs = await projectDb.getAllocations(pid);
      batchExisting.set(pid, allocs.map((a) => ({
        consultantId: a.consultantId,
        weekday:      a.weekday,
        cadence:      proj.cadence,
        startDate:    sd,
        endDate:      ed,
        projectId:    pid,
      })));
    }

    const results: Record<number, SimResult> = {};
    const tentative: CommittedEntry[] = [];
    const processedIds = new Set<number>();

    for (const projectId of projectIds) {
      const project = allProjects.find((p) => p.id === projectId);
      if (!project) {
        results[projectId] = {
          feasible: false, issues: ["Projeto não encontrado"],
          suggestions: [], proposed: [], earliestFeasibleDate: null,
        };
        continue;
      }
      const startDate = toDateStr(project.startDate);
      const endDate   = toDateStr(project.endDate);

      // Constraints = DB base + existing allocs of sibling projects NOT yet processed
      const siblingExisting: CommittedEntry[] = [];
      for (const [pid, entries] of Array.from(batchExisting)) {
        if (pid !== projectId && !processedIds.has(pid)) {
          siblingExisting.push(...entries);
        }
      }
      const allCommitted = [...committed, ...siblingExisting, ...tentative];

      const result = await runSimulation(projectId, allConsultants, allCommitted, randomize);
      processedIds.add(projectId);

      if (result.feasible) {
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
        // Try to find earliest feasible start date (shift by 1 week, up to 26 weeks)
        const originalDuration = new Date(endDate).getTime() - new Date(startDate).getTime();
        for (let weeksOffset = 1; weeksOffset <= 26; weeksOffset++) {
          const newStart = new Date(new Date(startDate).getTime() + weeksOffset * 7 * 86400000);
          const newEnd   = new Date(newStart.getTime() + originalDuration);
          const newStartStr = newStart.toISOString().split("T")[0];
          const newEndStr   = newEnd.toISOString().split("T")[0];
          const retry = await runSimulation(
            projectId, allConsultants, allCommitted, false,
            { startDate: newStartStr, endDate: newEndStr },
          );
          if (retry.feasible) {
            result.earliestFeasibleDate = newStartStr;
            result.suggestions.push(
              `Data mais cedo viável: ${newStartStr} (${weeksOffset} semana${weeksOffset > 1 ? "s" : ""} depois)`,
            );
            break;
          }
        }
        // If weekly and still infeasible, try biweekly cadences
        if (project.cadence === "weekly") {
          for (const bwCadence of ["biweekly_odd", "biweekly_even"] as const) {
            const bwRetry = await runSimulation(
              projectId, allConsultants, allCommitted, false,
              { cadence: bwCadence },
            );
            if (bwRetry.feasible) {
              const label =
                bwCadence === "biweekly_odd"
                  ? "quinzenal (semanas ímpares)"
                  : "quinzenal (semanas pares)";
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
