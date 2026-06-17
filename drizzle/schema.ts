import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/mysql-core";

// ── Users (auth) ──────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Consultants ───────────────────────────────────────────────────────────────
export const consultants = mysqlTable(
  "consultants",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    level: mysqlEnum("level", ["junior", "pleno", "senior"]).notNull().default("junior"),
    isLeader: boolean("is_leader").notNull().default(false),
    maxDays: int("max_days").notNull().default(5),
    restrictions: json("restrictions").$type<number[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_consultants_level").on(t.level), index("idx_consultants_is_leader").on(t.isLeader)],
);

export type Consultant = typeof consultants.$inferSelect;
export type InsertConsultant = typeof consultants.$inferInsert;

// ── Projects ──────────────────────────────────────────────────────────────────
export const projects = mysqlTable(
  "projects",
  {
    id: int("id").autoincrement().primaryKey(),
    acronym: varchar("acronym", { length: 5 }).notNull(),
    client: varchar("client", { length: 200 }).notNull(),
    status: mysqlEnum("status", ["confirmed", "hot", "cold", "archived"]).notNull().default("cold"),
    startDate: varchar("start_date", { length: 10 }).notNull(),
    endDate: varchar("end_date", { length: 10 }).notNull(),
    cadence: mysqlEnum("cadence", ["weekly", "biweekly_odd", "biweekly_even"]).notNull().default("weekly"),
    visitDays: json("visit_days").$type<number[]>().notNull().default([]),
    leaderConsultantId: int("leader_consultant_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_projects_status").on(t.status),
    index("idx_projects_dates").on(t.startDate, t.endDate),
  ],
);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ── Allocations ───────────────────────────────────────────────────────────────
export const allocations = mysqlTable(
  "allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("project_id").notNull(),
    consultantId: int("consultant_id").notNull(),
    weekday: int("weekday").notNull(),
    role: mysqlEnum("role", ["líder", "consultor"]).notNull().default("consultor"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_allocations_project").on(t.projectId),
    index("idx_allocations_consultant").on(t.consultantId),
  ],
);

export type Allocation = typeof allocations.$inferSelect;
export type InsertAllocation = typeof allocations.$inferInsert;

// ── Pinned Slots ──────────────────────────────────────────────────────────────
export const pinnedSlots = mysqlTable(
  "pinned_slots",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("project_id").notNull(),
    consultantId: int("consultant_id").notNull(),
    daysPerWeek: int("days_per_week").notNull().default(1),
    visitDays: json("visit_days").$type<number[]>().notNull().default([]),
    assignedDays: json("assigned_days").$type<number[]>().notNull().default([]),
    cadence: mysqlEnum("cadence", ["weekly", "biweekly_odd", "biweekly_even"]).default("weekly"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_pinned_slots_project").on(t.projectId)],
);

export type PinnedSlot = typeof pinnedSlots.$inferSelect;
export type InsertPinnedSlot = typeof pinnedSlots.$inferInsert;

// ── Level Slots ───────────────────────────────────────────────────────────────
export const levelSlots = mysqlTable(
  "level_slots",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("project_id").notNull(),
    level: mysqlEnum("level", ["junior", "pleno", "senior"]).notNull(),
    isLeader: boolean("is_leader").notNull().default(false),
    daysPerWeek: int("days_per_week").notNull().default(1),
    visitDays: json("visit_days").$type<number[]>().notNull().default([]),
    assignedConsultantId: int("assigned_consultant_id"),
    assignedDays: json("assigned_days").$type<number[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_level_slots_project").on(t.projectId)],
);

export type LevelSlot = typeof levelSlots.$inferSelect;
export type InsertLevelSlot = typeof levelSlots.$inferInsert;

// ── Absences ──────────────────────────────────────────────────────────────────
export const absences = mysqlTable(
  "absences",
  {
    id: int("id").autoincrement().primaryKey(),
    consultantId: int("consultant_id").notNull(),
    startDate: varchar("start_date", { length: 10 }).notNull(),
    endDate: varchar("end_date", { length: 10 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_absences_consultant").on(t.consultantId)],
);

export type Absence = typeof absences.$inferSelect;
export type InsertAbsence = typeof absences.$inferInsert;