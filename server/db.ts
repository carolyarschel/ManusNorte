import { eq, and, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, consultants, projects, allocations, pinnedSlots, levelSlots, absences } from "../drizzle/schema";
import type { Consultant, InsertConsultant, Project, InsertProject, Allocation, PinnedSlot, InsertPinnedSlot, LevelSlot, InsertLevelSlot, Absence, InsertAbsence } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Consultants ───────────────────────────────────────────────────────────────
export const consultantDb = {
  async findAll(): Promise<Consultant[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(consultants).orderBy(consultants.name);
  },
  async findById(id: number): Promise<Consultant | undefined> {
    const db = await getDb();
    if (!db) return undefined;
    const r = await db.select().from(consultants).where(eq(consultants.id, id)).limit(1);
    return r[0];
  },
  async create(data: Omit<InsertConsultant, "id">): Promise<Consultant> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [result] = await db.insert(consultants).values(data);
    const created = await db.select().from(consultants).where(eq(consultants.id, (result as any).insertId)).limit(1);
    return created[0];
  },
  async update(id: number, data: Partial<InsertConsultant>): Promise<Consultant> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(consultants).set(data).where(eq(consultants.id, id));
    const updated = await db.select().from(consultants).where(eq(consultants.id, id)).limit(1);
    return updated[0];
  },
  async remove(id: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(consultants).where(eq(consultants.id, id));
  },
};

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectDb = {
  async findAll(): Promise<Project[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(projects).orderBy(projects.acronym);
  },
  async findById(id: number): Promise<Project | undefined> {
    const db = await getDb();
    if (!db) return undefined;
    const r = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return r[0];
  },
  async create(data: Omit<InsertProject, "id">): Promise<Project> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [result] = await db.insert(projects).values(data);
    const created = await db.select().from(projects).where(eq(projects.id, (result as any).insertId)).limit(1);
    return created[0];
  },
  async update(id: number, data: Partial<InsertProject>): Promise<Project> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(projects).set(data).where(eq(projects.id, id));
    const updated = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return updated[0];
  },
  async remove(id: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(allocations).where(eq(allocations.projectId, id));
    await db.delete(pinnedSlots).where(eq(pinnedSlots.projectId, id));
    await db.delete(levelSlots).where(eq(levelSlots.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  },
  async getPinnedSlots(projectId: number): Promise<PinnedSlot[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(pinnedSlots).where(eq(pinnedSlots.projectId, projectId));
  },
  async getLevelSlots(projectId: number): Promise<LevelSlot[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(levelSlots).where(eq(levelSlots.projectId, projectId));
  },
  async getAllocations(projectId: number): Promise<Allocation[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(allocations).where(eq(allocations.projectId, projectId));
  },
  async setPinnedSlots(projectId: number, slots: Omit<InsertPinnedSlot, "id">[]): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(pinnedSlots).where(eq(pinnedSlots.projectId, projectId));
    if (slots.length > 0) await db.insert(pinnedSlots).values(slots);
  },
  async setLevelSlots(projectId: number, slots: Omit<InsertLevelSlot, "id">[]): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(levelSlots).where(eq(levelSlots.projectId, projectId));
    if (slots.length > 0) await db.insert(levelSlots).values(slots);
  },
};

// ── Allocations ───────────────────────────────────────────────────────────────
export const allocationDb = {
  async findAll(): Promise<Allocation[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(allocations);
  },
  async findByProject(projectId: number): Promise<Allocation[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(allocations).where(eq(allocations.projectId, projectId));
  },
  async setForProject(
    projectId: number,
    newAllocations: { consultantId: number; weekday: number; role: "l\u00edder" | "consultor" }[],
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(allocations).where(eq(allocations.projectId, projectId));
    if (newAllocations.length > 0) {
      await db.insert(allocations).values(
        newAllocations.map((a) => ({ projectId, consultantId: a.consultantId, weekday: a.weekday, role: a.role }))
      );
    }
    const daysSet = new Set(newAllocations.map((a) => a.weekday));
    const days = Array.from(daysSet).sort((a, b) => a - b);
    await db.update(projects).set({ visitDays: days }).where(eq(projects.id, projectId));
    const allPinned = await db.select().from(pinnedSlots).where(eq(pinnedSlots.projectId, projectId));
    for (const ps of allPinned) {
      const assignedDays = newAllocations
        .filter((a) => a.consultantId === ps.consultantId)
        .map((a) => a.weekday)
        .sort((a, b) => a - b);
      await db.update(pinnedSlots).set({ assignedDays }).where(eq(pinnedSlots.id, ps.id));
    }
  },
  async clearForProject(projectId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(allocations).where(eq(allocations.projectId, projectId));
    await db.update(projects).set({ visitDays: [] }).where(eq(projects.id, projectId));
  },
};

// ── Absences ──────────────────────────────────────────────────────────────────
export const absenceDb = {
  async findAll(): Promise<Absence[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(absences).orderBy(absences.startDate);
  },
  async findByConsultant(consultantId: number): Promise<Absence[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(absences).where(eq(absences.consultantId, consultantId));
  },
  async create(data: Omit<InsertAbsence, "id">): Promise<Absence> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [result] = await db.insert(absences).values(data);
    const created = await db.select().from(absences).where(eq(absences.id, (result as any).insertId)).limit(1);
    return created[0];
  },
  async update(id: number, data: Partial<InsertAbsence>): Promise<Absence> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(absences).set(data).where(eq(absences.id, id));
    const updated = await db.select().from(absences).where(eq(absences.id, id)).limit(1);
    return updated[0];
  },
  async remove(id: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(absences).where(eq(absences.id, id));
  },
};
