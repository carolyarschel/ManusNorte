import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { consultantDb, projectDb, allocationDb, absenceDb } from "./db";
import { simulationService } from "./simulation";
import { schedulingService } from "./scheduling";

const consultantInput = z.object({
  name: z.string().min(1),
  level: z.enum(["junior", "pleno", "senior"]),
  isLeader: z.boolean().default(false),
  maxDays: z.number().int().min(1).max(5).default(5),
  restrictions: z.array(z.number().int().min(1).max(5)).default([]),
  notes: z.string().nullable().optional(),
});

const projectInput = z.object({
  acronym: z.string().min(1).max(5),
  client: z.string().min(1),
  status: z.enum(["confirmed", "hot", "cold", "archived"]),
  startDate: z.string(),
  endDate: z.string(),
  cadence: z.enum(["weekly", "biweekly_odd", "biweekly_even"]),
  leaderConsultantId: z.number().int().nullable().optional(),
});

const pinnedSlotInput = z.object({
  consultantId: z.number().int(),
  daysPerWeek: z.number().int().min(1).max(5),
  visitDays: z.array(z.number().int().min(1).max(5)),
  cadence: z.enum(["weekly", "biweekly_odd", "biweekly_even"]).default("weekly"),
});

const levelSlotInput = z.object({
  level: z.enum(["junior", "pleno", "senior"]),
  isLeader: z.boolean().default(false),
  daysPerWeek: z.number().int().min(1).max(5),
  visitDays: z.array(z.number().int().min(1).max(5)),
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  consultants: router({
    list: publicProcedure.query(() => consultantDb.findAll()),
    getById: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ input }) => consultantDb.findById(input.id)),
    create: publicProcedure
      .input(consultantInput)
      .mutation(({ input }) => consultantDb.create({ name: input.name, level: input.level, isLeader: input.isLeader, maxDays: input.maxDays, restrictions: input.restrictions, notes: input.notes ?? null })),
    update: publicProcedure
      .input(z.object({ id: z.number().int(), data: consultantInput.partial() }))
      .mutation(({ input }) => consultantDb.update(input.id, input.data)),
    remove: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input }) => consultantDb.remove(input.id)),
  }),

  projects: router({
    list: publicProcedure.query(async () => {
      const projs = await projectDb.findAll();
      const allAllocs = await allocationDb.findAll();
      return Promise.all(projs.map(async (p) => {
        const projAllocs = allAllocs.filter((a) => a.projectId === p.id);
        const ps = await projectDb.getPinnedSlots(p.id);
        const ls = await projectDb.getLevelSlots(p.id);
        const allocatedConsultants = Array.from(new Set(projAllocs.map((a) => a.consultantId)));
        return { ...p, visitDays: (p.visitDays as number[]) ?? [], allocations: projAllocs, pinnedSlots: ps, levelSlots: ls, allocatedConsultants };
      }));
    }),
    getById: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const p = await projectDb.findById(input.id);
        if (!p) return null;
        const allocs = await projectDb.getAllocations(p.id);
        const ps = await projectDb.getPinnedSlots(p.id);
        const ls = await projectDb.getLevelSlots(p.id);
        return { ...p, allocations: allocs, pinnedSlots: ps, levelSlots: ls };
      }),
    create: publicProcedure
      .input(projectInput.extend({ pinnedSlots: z.array(pinnedSlotInput).optional(), levelSlots: z.array(levelSlotInput).optional() }))
      .mutation(async ({ input }) => {
        const p = await projectDb.create({ acronym: input.acronym, client: input.client, status: input.status, startDate: input.startDate, endDate: input.endDate, cadence: input.cadence, visitDays: [], leaderConsultantId: input.leaderConsultantId ?? null });
        if (input.pinnedSlots?.length) await projectDb.setPinnedSlots(p.id, input.pinnedSlots.map((s) => ({ ...s, projectId: p.id, assignedDays: [] })));
        if (input.levelSlots?.length) await projectDb.setLevelSlots(p.id, input.levelSlots.map((s) => ({ ...s, projectId: p.id, assignedDays: [], assignedConsultantId: null })));
        return p;
      }),
    update: publicProcedure
      .input(z.object({ id: z.number().int(), data: projectInput.partial().extend({ pinnedSlots: z.array(pinnedSlotInput).optional(), levelSlots: z.array(levelSlotInput).optional() }) }))
      .mutation(async ({ input }) => {
        const { pinnedSlots: ps, levelSlots: ls, ...rest } = input.data;
        const p = await projectDb.update(input.id, rest);
        if (ps !== undefined) await projectDb.setPinnedSlots(input.id, ps.map((s) => ({ ...s, projectId: input.id, assignedDays: [] })));
        if (ls !== undefined) await projectDb.setLevelSlots(input.id, ls.map((s) => ({ ...s, projectId: input.id, assignedDays: [], assignedConsultantId: null })));
        return p;
      }),
    remove: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input }) => projectDb.remove(input.id)),
    setAllocations: publicProcedure
      .input(z.object({ projectId: z.number().int(), allocations: z.array(z.object({ consultantId: z.number().int(), weekday: z.number().int().min(1).max(5), role: z.enum(["l\u00edder", "consultor"]) })) }))
      .mutation(({ input }) => allocationDb.setForProject(input.projectId, input.allocations)),
    clearAllocations: publicProcedure
      .input(z.object({ projectId: z.number().int() }))
      .mutation(({ input }) => allocationDb.clearForProject(input.projectId)),
  }),

  absences: router({
    list: publicProcedure.query(() => absenceDb.findAll()),
    listByConsultant: publicProcedure
      .input(z.object({ consultantId: z.number().int() }))
      .query(({ input }) => absenceDb.findByConsultant(input.consultantId)),
    create: publicProcedure
      .input(z.object({ consultantId: z.number().int(), startDate: z.string(), endDate: z.string(), reason: z.string().nullable().optional() }))
      .mutation(({ input }) => absenceDb.create({ consultantId: input.consultantId, startDate: input.startDate, endDate: input.endDate, reason: input.reason ?? null })),
    update: publicProcedure
      .input(z.object({ id: z.number().int(), data: z.object({ startDate: z.string().optional(), endDate: z.string().optional(), reason: z.string().nullable().optional() }) }))
      .mutation(({ input }) => absenceDb.update(input.id, input.data)),
    remove: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input }) => absenceDb.remove(input.id)),
  }),

  simulation: router({
    run: publicProcedure
      .input(z.object({ projectIds: z.array(z.number().int()), randomize: z.boolean().default(false) }))
      .mutation(({ input }) => simulationService.simulateBatch(input.projectIds, input.randomize)),
  }),

  scheduling: router({
    run: publicProcedure
      .input(z.object({ projectIds: z.array(z.number().int()) }))
      .mutation(({ input }) => schedulingService.schedule(input.projectIds)),
  }),
});

export type AppRouter = typeof appRouter;
