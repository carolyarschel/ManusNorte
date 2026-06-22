export type ConsultantLevel = "senior" | "pleno" | "junior";
export type ProjectStatus   = "confirmed" | "hot" | "cold" | "archived";
export type Weekday         = 1 | 2 | 3 | 4 | 5;
export type Cadence         = "weekly" | "biweekly_odd" | "biweekly_even";

export interface Allocation {
  id: number;
  projectId: number;
  consultantId: number;
  weekday: number;
  role: string;
}

export interface LevelSlot {
  id: number;
  projectId: number;
  level: ConsultantLevel;
  isLeader: boolean;
  daysPerWeek: number;
  visitDays: number[];
  assignedConsultantId: number | null;
  assignedDays: number[];
}

export interface PinnedSlot {
  id: number;
  projectId: number;
  consultantId: number;
  daysPerWeek: number;
  visitDays: number[];
  assignedDays: number[];
  cadence: string | null;
}

export interface Consultant {
  id: number;
  name: string;
  level: ConsultantLevel;
  isLeader: boolean;
  maxDays: number;
  restrictions: Weekday[];
  notes: string | null;
}

export interface Project {
  id: number;
  acronym: string;
  client: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  cadence: Cadence;
  visitDays: number[];
  leaderConsultantId: number | null;
  notes: string | null;
  levelSlots: LevelSlot[];
  pinnedSlots: PinnedSlot[];
  allocations: Allocation[];
  allocatedConsultants: number[];
}

export interface Absence {
  id: number;
  consultantId: number;
  startDate: string;
  endDate: string;
  reason: string | null;
}
