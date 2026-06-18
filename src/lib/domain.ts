import type {
  Project, Consultant, ConsultantLoad, ConflictEntry, ChipColor, Weekday,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DAY_NAMES: Record<number, string> = {
  1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex",
};

export const LEVEL_LABELS = {
  senior: "Sênior", pleno: "Pleno", junior: "Júnior",
} as const;

export const STATUS_META = {
  confirmed: { label: "Confirmado",       color: "#c0392b", bg: "rgba(192,57,43,0.1)"   },
  hot:       { label: "Prospecto Quente", color: "#e67e22", bg: "rgba(230,126,34,0.1)"  },
  cold:      { label: "Prospecto Frio",   color: "#7f8c8d", bg: "rgba(127,140,141,0.1)" },
  archived:  { label: "Arquivado",        color: "#aaa",    bg: "rgba(180,180,180,0.1)" },
} as const;

export const CADENCE_LABELS = {
  weekly:        "Semanal",
  biweekly_odd:  "Quinzenal (ímpares)",
  biweekly_even: "Quinzenal (pares)",
} as const;

export const PROJECT_COLORS: ChipColor[] = [
  { bg: "#d6eaf8", border: "#2e86c1", text: "#1a5276" },
  { bg: "#d5f5e3", border: "#1e8449", text: "#145a32" },
  { bg: "#fde8d8", border: "#ca6f1e", text: "#784212" },
  { bg: "#e8daef", border: "#7d3c98", text: "#4a235a" },
  { bg: "#fdf2d0", border: "#b7950b", text: "#7d6608" },
  { bg: "#d1f2eb", border: "#148f77", text: "#0e6655" },
  { bg: "#fadbd8", border: "#c0392b", text: "#922b21" },
  { bg: "#d6dbdf", border: "#5d6d7e", text: "#2e4057" },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function fmtDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export function jsDateToWeekday(date: Date): Weekday | null {
  const d = date.getDay();
  if (d === 0 || d === 6) return null;
  return d as Weekday;
}

// ─── Project helpers ──────────────────────────────────────────────────────────

export function projectVisitsOnDate(project: Project, date: Date): boolean {
  const start = new Date(project.startDate);
  const end   = new Date(project.endDate);
  if (date < start || date > end) return false;
  const weekday = jsDateToWeekday(date);
  if (!weekday) return false;
  if (!(project.visitDays ?? []).includes(weekday)) return false;
  if (project.cadence === "weekly") return true;
  const week = getISOWeek(date);
  if (project.cadence === "biweekly_odd")  return week % 2 === 1;
  if (project.cadence === "biweekly_even") return week % 2 === 0;
  return false;
}

/**
 * True when a confirmed project already has every slot filled by a consultant.
 * These projects don't need to appear in the simulation selection list.
 */
export function isFullyAllocated(project: Project): boolean {
  const totalSlots = (project.levelSlots ?? []).length + (project.pinnedSlots ?? []).length;
  if (totalSlots === 0) return true;
  const allocatedCount = new Set((project.allocations ?? []).map((a) => a.consultantId)).size;
  return allocatedCount >= totalSlots;
}

/** Weekly cost of the project in days/week (0.5x for biweekly). */
export function projectDayCost(project: Project): number {
  const factor = project.cadence === "weekly" ? 1 : 0.5;
  return (project.visitDays ?? []).length * factor;
}

export function getProjectColor(projectId: number, projects: Project[]): ChipColor {
  const idx = projects.findIndex((p) => p.id === projectId);
  return PROJECT_COLORS[idx % PROJECT_COLORS.length];
}

// ─── Consultant helpers ───────────────────────────────────────────────────────

export function computeLoad(consultantId: number, projects: Project[]): ConsultantLoad {
  let total = 0;
  const list: Project[] = [];
  for (const p of projects) {
    if (p.status === "archived") continue;
    if (!(p.allocatedConsultants ?? []).includes(consultantId)) continue;
    // Cost = days they personally visit, not the whole project's visitDays
    const pinned = (p.pinnedSlots ?? []).find((s) => s.consultantId === consultantId);
    const factor = p.cadence === "weekly" ? 1 : 0.5;
    if (pinned) {
      total += pinned.daysPerWeek * factor;
    } else if ((p.allocations ?? []).length > 0) {
      const days = p.allocations!.filter((a) => a.consultantId === consultantId).length;
      total += days * factor;
    } else {
      total += factor;
    }
    list.push(p);
  }
  return { total, projects: list };
}

/** Returns remaining available days/week for a consultant. */
export function remainingCapacity(c: Consultant, projects: Project[]): number {
  return c.maxDays - computeLoad(c.id, projects).total;
}

/**
 * Returns the set of weekdays a consultant is already committed to
 * across all confirmed projects (respecting cadence).
 * biweekly projects occupy their days every OTHER week, so they
 * still block those days for any new weekly project.
 */
export function consultantBusyDays(consultantId: number, projects: Project[]): Weekday[] {
  const busy = new Set<Weekday>();
  for (const p of projects) {
    if (p.status === "archived") continue;
    if (!(p.allocatedConsultants ?? []).includes(consultantId)) continue;

    // Find which days this consultant specifically visits in this project
    const pinned = (p.pinnedSlots ?? []).find((s) => s.consultantId === consultantId);
    const days: Weekday[] = pinned?.visitDays?.length
      ? pinned.visitDays
      : (p.visitDays ?? []);

    days.forEach((d) => busy.add(d));
  }
  return Array.from(busy);
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export function detectConflicts(projects: Project[]): ConflictEntry[] {
  const active = projects.filter((p) => p.status !== "archived");
  const out: ConflictEntry[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];

      // Find consultants present in both projects
      const sc = (a.allocatedConsultants ?? []).filter((c) =>
        (b.allocatedConsultants ?? []).includes(c)
      );
      if (!sc.length) continue;

      // Alternating biweekly cadences never overlap on the same week
      const alternating =
        (a.cadence === "biweekly_odd"  && b.cadence === "biweekly_even") ||
        (a.cadence === "biweekly_even" && b.cadence === "biweekly_odd");
      if (alternating) continue;

      // Date range must overlap
      const aStart = new Date(a.startDate), aEnd = new Date(a.endDate);
      const bStart = new Date(b.startDate), bEnd = new Date(b.endDate);
      if (!(aStart <= bEnd && bStart <= aEnd)) continue;

      // For each shared consultant, check if they visit BOTH projects on the SAME day
      const conflictingDays = new Set<Weekday>();
      for (const cId of sc) {
        // Actual allocations are the authoritative source; fall back to pinned slot
        // request days, then to the project-wide union (least precise).
        const aAllocDays = (a.allocations ?? [])
          .filter((al) => al.consultantId === cId)
          .map((al) => al.weekday as Weekday);
        const bAllocDays = (b.allocations ?? [])
          .filter((al) => al.consultantId === cId)
          .map((al) => al.weekday as Weekday);

        const aPinned = (a.pinnedSlots ?? []).find((s) => s.consultantId === cId);
        const bPinned = (b.pinnedSlots ?? []).find((s) => s.consultantId === cId);

        const aDays: Weekday[] = aAllocDays.length
          ? aAllocDays
          : (aPinned?.visitDays?.length ? aPinned.visitDays : (a.visitDays ?? []));
        const bDays: Weekday[] = bAllocDays.length
          ? bAllocDays
          : (bPinned?.visitDays?.length ? bPinned.visitDays : (b.visitDays ?? []));

        aDays.filter((d) => bDays.includes(d)).forEach((d) => conflictingDays.add(d));
      }

      if (!conflictingDays.size) continue; // same consultant, different days — no conflict

      const sd = Array.from(conflictingDays) as Weekday[];
      out.push({
        a, b,
        sharedConsultants: sc,
        sharedDays: sd,
        severity: sc.length >= 2 ? "high" : "medium",
      });
    }
  }
  return out;
}

