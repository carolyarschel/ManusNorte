// ─── Enums ────────────────────────────────────────────────────────────────────

export type ConsultantLevel = "junior" | "pleno" | "senior";
export type ProjectStatus   = "confirmed" | "hot" | "cold" | "archived";
export type Cadence         = "weekly" | "biweekly_odd" | "biweekly_even";
export type Weekday         = 1 | 2 | 3 | 4 | 5; // 1=Mon … 5=Fri

// ─── Demand slots ─────────────────────────────────────────────────────────────

/** A slot that must be filled by someone of a given level (quantity x days/week) */
export interface LevelSlot {
  level: ConsultantLevel;
  isLeader: boolean;
  daysPerWeek: number;        // how many days/week this role visits
  visitDays: Weekday[];       // empty = to be decided by simulation
}

/** A slot pinned to a specific consultant */
export interface PinnedSlot {
  consultantId: number;
  daysPerWeek: number;
  visitDays: Weekday[];       // empty = to be decided by simulation
  cadence?: Cadence | null;   // null/undefined = inherit project cadence
}

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Absence {
  id: number;
  consultantId: number;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface Consultant {
  id: number;
  name: string;
  level: ConsultantLevel;
  isLeader: boolean;
  maxDays: number;
  restrictions: Weekday[];
  notes?: string | null;
}

export interface Project {
  id: number;
  acronym: string;
  client: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  cadence: Cadence;
  leaderConsultantId?: number | null; // which allocated consultant is acting as project leader
  notes?: string | null;
  // Demand definition (replaces old visitDays + requiredLeader + mandatoryConsultants)
  levelSlots: LevelSlot[];
  pinnedSlots: PinnedSlot[];
  // Resolved allocation (filled manually or by simulation)
  visitDays: Weekday[];           // union of all days actually used
  allocatedConsultants: number[]; // resolved consultant IDs
  allocations?: { id: number; consultantId: number; weekday: number; role: string }[];
}

// ─── Derived types ────────────────────────────────────────────────────────────

export interface ChipColor {
  bg: string;
  border: string;
  text: string;
}

export interface ConsultantLoad {
  total: number;
  projects: Project[];
}

export interface ConflictEntry {
  a: Project;
  b: Project;
  sharedConsultants: number[];
  sharedDays: Weekday[];
  severity: "high" | "medium";
}
