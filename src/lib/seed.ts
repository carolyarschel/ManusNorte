import type { Consultant, Project } from "@/types";

export const SEED_CONSULTANTS: Consultant[] = [
  { id: 1, name: "Ana Rodrigues",  level: "senior", isLeader: true,  maxDays: 5, restrictions: []    },
  { id: 2, name: "Bruno Melo",     level: "senior", isLeader: true,  maxDays: 3, restrictions: [3]   },
  { id: 3, name: "Carla Souza",    level: "pleno",  isLeader: true,  maxDays: 5, restrictions: []    },
  { id: 4, name: "Diego Lima",     level: "pleno",  isLeader: false, maxDays: 2, restrictions: [1,5] },
  { id: 5, name: "Elena Ferreira", level: "pleno",  isLeader: false, maxDays: 5, restrictions: []    },
  { id: 6, name: "Felipe Castro",  level: "junior", isLeader: false, maxDays: 5, restrictions: []    },
  { id: 7, name: "Gabriela Nunes", level: "junior", isLeader: false, maxDays: 4, restrictions: [5]   },
  { id: 8, name: "Henrique Pires", level: "junior", isLeader: false, maxDays: 5, restrictions: []    },
];

// IMPORTANT: No consultant appears in two projects on the same weekday.
//
// TDG: Mon/Wed (Ana leader Mon, Carla Wed, Felipe Mon+Wed)
// RFN: Tue/Thu (Bruno leader Tue+Thu, Elena Tue+Thu)
// ADP: biweekly_odd Mon/Thu (Carla leader Mon, Gabriela Mon+Thu)
//   → Carla does Mon on TDG weekly and Mon on ADP biweekly. That IS a conflict
//     on odd weeks. Fix: ADP uses Thu/Fri instead so no overlap with Carla's TDG days.
//
// Final layout:
//   Ana:     TDG Mon(L), TDG Wed         → Mon, Wed
//   Bruno:   RFN Tue(L), RFN Thu(L)      → Tue, Thu
//   Carla:   TDG Wed(consultor)           → Wed  (free for ADP biweekly Thu)
//            ADP Thu(L) biweekly odd      → Thu (odd weeks only)
//   Diego:   (none)
//   Elena:   RFN Tue, RFN Thu             → Tue, Thu
//   Felipe:  TDG Mon, TDG Wed            → Mon, Wed
//   Gabriela:ADP Thu biweekly odd         → Thu (odd weeks only)
//   Henrique:(none)

export const SEED_PROJECTS: Project[] = [
  {
    id: 1, acronym: "TDG", client: "Banco Alfa",
    status: "confirmed", startDate: "2026-05-01", endDate: "2026-08-29",
    cadence: "weekly",
    levelSlots: [
      { level: "senior", isLeader: true,  daysPerWeek: 2, visitDays: [1, 3] },
    ],
    pinnedSlots: [
      { consultantId: 3, daysPerWeek: 1, visitDays: [3] },
      { consultantId: 6, daysPerWeek: 2, visitDays: [1, 3] },
    ],
    visitDays: [1, 3],
    allocatedConsultants: [1, 3, 6],
  },
  {
    id: 2, acronym: "RFN", client: "Indústrias Beta",
    status: "confirmed", startDate: "2026-05-01", endDate: "2026-07-25",
    cadence: "weekly",
    levelSlots: [
      { level: "senior", isLeader: true, daysPerWeek: 2, visitDays: [2, 4] },
    ],
    pinnedSlots: [
      { consultantId: 5, daysPerWeek: 2, visitDays: [2, 4] },
    ],
    visitDays: [2, 4],
    allocatedConsultants: [2, 5],
  },
  {
    id: 3, acronym: "ADP", client: "Varejo Gama",
    status: "confirmed", startDate: "2026-05-15", endDate: "2026-09-30",
    cadence: "biweekly_odd",
    levelSlots: [
      { level: "pleno", isLeader: true, daysPerWeek: 1, visitDays: [4] },
    ],
    pinnedSlots: [
      { consultantId: 7, daysPerWeek: 1, visitDays: [4] },
    ],
    visitDays: [4],
    allocatedConsultants: [3, 7],
  },
  {
    id: 4, acronym: "EXP", client: "Tech Delta",
    status: "hot", startDate: "2026-06-02", endDate: "2026-10-31",
    cadence: "biweekly_even",
    levelSlots: [
      { level: "senior", isLeader: true,  daysPerWeek: 1, visitDays: [] },
      { level: "junior", isLeader: false, daysPerWeek: 2, visitDays: [] },
    ],
    pinnedSlots: [],
    visitDays: [],
    allocatedConsultants: [],
  },
  {
    id: 5, acronym: "CGV", client: "Saúde Épsilon",
    status: "cold", startDate: "2026-07-01", endDate: "2026-11-28",
    cadence: "weekly",
    levelSlots: [
      { level: "pleno",  isLeader: false, daysPerWeek: 1, visitDays: [] },
      { level: "junior", isLeader: false, daysPerWeek: 1, visitDays: [] },
    ],
    pinnedSlots: [],
    visitDays: [],
    allocatedConsultants: [],
  },
];
