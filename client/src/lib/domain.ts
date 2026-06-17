// ─── Domain constants & helpers ──────────────────────────────────────────────

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

export const DAY_NAMES = ["", "Seg", "Ter", "Qua", "Qui", "Sex"] as const;

export type ChipColor = { bg: string; border: string; text: string };

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

export function getProjectColor(projectId: number, projects: { id: number }[]): ChipColor {
  const idx = projects.findIndex((p) => p.id === projectId);
  return PROJECT_COLORS[Math.max(0, idx) % PROJECT_COLORS.length];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function fmtDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function jsDateToWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d; // 1=Mon … 5=Fri
}

// ─── Brazilian holidays ───────────────────────────────────────────────────────

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function isoStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function brazilianHolidays(year: number): Set<string> {
  const set = new Set<string>();
  const fixed: [number, number][] = [
    [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25],
  ];
  for (const [month, day] of fixed) {
    set.add(isoStr(new Date(year, month - 1, day)));
  }
  const easter = easterSunday(year);
  set.add(isoStr(easter));
  set.add(isoStr(addDays(easter, -48)));
  set.add(isoStr(addDays(easter, -47)));
  set.add(isoStr(addDays(easter, -2)));
  set.add(isoStr(addDays(easter, 60)));
  return set;
}

export function isWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  return dow >= 1 && dow <= 5 && !brazilianHolidays(date.getFullYear()).has(isoStr(date));
}

// ─── Capacity helpers ─────────────────────────────────────────────────────────

export type ProjectForCapacity = {
  id: number;
  status: string;
  cadence: string;
  acronym?: string;
  startDate?: string;
  endDate?: string;
  allocations?: { consultantId: number; weekday: number }[];
  pinnedSlots?: { consultantId: number; daysPerWeek: number; cadence?: string | null; visitDays?: number[] | null }[];
  allocatedConsultants?: number[];
};

type ConsultantForCapacity = {
  id: number;
  maxDays: number;
};

export function computeLoad(consultantId: number, projects: ProjectForCapacity[]): number {
  let total = 0;
  for (const p of projects) {
    if (p.status === "archived") continue;
    const allocs = (p.allocations ?? []).filter((a) => a.consultantId === consultantId);
    if (!allocs.length) continue;
    const factor = p.cadence === "weekly" ? 1 : 0.5;
    const pinned = (p.pinnedSlots ?? []).find((s) => s.consultantId === consultantId);
    if (pinned) {
      const slotCadence = pinned.cadence ?? p.cadence;
      const slotFactor = slotCadence === "weekly" ? 1 : 0.5;
      total += pinned.daysPerWeek * slotFactor;
    } else {
      total += allocs.length * factor;
    }
  }
  return total;
}

export function remainingCapacity(c: ConsultantForCapacity, projects: ProjectForCapacity[]): number {
  return c.maxDays - computeLoad(c.id, projects);
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export type ProjectForConflict = {
  id: number;
  status: string;
  cadence: string;
  startDate: string;
  endDate: string;
  acronym: string;
  allocations?: { consultantId: number; weekday: number }[];
  pinnedSlots?: { consultantId: number; visitDays?: number[] | null }[];
  allocatedConsultants?: number[];
};

export type ConflictEntry = {
  a: ProjectForCapacity;
  b: ProjectForCapacity;
  sharedConsultants: number[];
  sharedDays: number[];
  severity: "high" | "medium";
};

function rangesOverlap(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS <= bE && bS <= aE;
}

export function detectConflicts(projects: ProjectForCapacity[]): ConflictEntry[] {
  const active = projects.filter((p) => p.status !== "archived");
  const out: ConflictEntry[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const sc = (a.allocatedConsultants ?? []).filter((cId) =>
        (b.allocatedConsultants ?? []).includes(cId)
      );
      if (!sc.length) continue;
      const alternating =
        (a.cadence === "biweekly_odd"  && b.cadence === "biweekly_even") ||
        (a.cadence === "biweekly_even" && b.cadence === "biweekly_odd");
      if (alternating) continue;
      if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) continue;
      if (!rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) continue;
      const conflictingDays = new Set<number>();
      for (const cId of sc) {
        const aAllocDays = (a.allocations ?? []).filter((al) => al.consultantId === cId).map((al) => al.weekday);
        const bAllocDays = (b.allocations ?? []).filter((al) => al.consultantId === cId).map((al) => al.weekday);
        const aPinned = (a.pinnedSlots ?? []).find((s) => s.consultantId === cId);
        const bPinned = (b.pinnedSlots ?? []).find((s) => s.consultantId === cId);
        const aDays = aAllocDays.length ? aAllocDays : (aPinned?.visitDays ?? []);
        const bDays = bAllocDays.length ? bAllocDays : (bPinned?.visitDays ?? []);
        aDays.filter((d) => bDays.includes(d)).forEach((d) => conflictingDays.add(d));
      }
      if (!conflictingDays.size) continue;
      const sd = Array.from(conflictingDays);
      out.push({
        a, b,
        sharedConsultants: sc,
        sharedDays: sd,
        severity: a.status === "confirmed" && b.status === "confirmed" ? "high" : "medium",
      });
    }
  }
  return out;
}

// ─── Monthly occupancy ────────────────────────────────────────────────────────

export function computeMonthlyOccupancy(
  consultants: ConsultantForCapacity[],
  projects: ProjectForCapacity[],
  month: Date,
): { used: number; total: number; free: number; pct: number } {
  const y = month.getFullYear(), m = month.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd   = new Date(y, m + 1, 0);
  let workingDays = 0;
  { const d = new Date(monthStart);
    while (d <= monthEnd) { if (isWorkingDay(d)) workingDays++; d.setDate(d.getDate() + 1); } }
  let usedDays = 0;
  let totalCapDays = 0;
  for (const c of consultants) {
    totalCapDays += (c.maxDays / 5) * workingDays;
    for (const p of projects) {
      if (p.status === "archived") continue;
      const allocs = (p.allocations ?? []).filter((a) => a.consultantId === c.id);
      if (!allocs.length) continue;
      const pStart   = new Date(p.startDate ?? "2000-01-01");
      const pEnd     = new Date(p.endDate ?? "2099-12-31");
      const effStart = new Date(Math.max(pStart.getTime(), monthStart.getTime()));
      const effEnd   = new Date(Math.min(pEnd.getTime(),   monthEnd.getTime()));
      if (effStart > effEnd) continue;
      for (const alloc of allocs) {
        const iter = new Date(effStart);
        while (iter <= effEnd) {
          if (iter.getDay() === alloc.weekday && isWorkingDay(iter)) {
            const week = getISOWeek(iter);
            if (p.cadence === "weekly" ||
                (p.cadence === "biweekly_odd"  && week % 2 === 1) ||
                (p.cadence === "biweekly_even" && week % 2 === 0)) {
              usedDays++;
            }
          }
          iter.setDate(iter.getDate() + 1);
        }
      }
    }
  }
  const freeDays = Math.max(0, totalCapDays - usedDays);
  const pct = totalCapDays > 0 ? Math.round(usedDays / totalCapDays * 100) : 0;
  return { used: usedDays, total: Math.round(totalCapDays), free: Math.round(freeDays), pct };
}

// ─── Simulation helpers ───────────────────────────────────────────────────────
export function isFullyAllocated(p: { levelSlots: { assignedConsultantId: number | null }[]; allocations?: { consultantId: number }[] }): boolean {
  if ((p.allocations ?? []).length > 0) return true;
  if (!p.levelSlots.length) return false;
  return p.levelSlots.every((s) => s.assignedConsultantId !== null);
}
