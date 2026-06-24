import { Router } from "express";
import { z } from "zod";
import { projectController } from "./project.controller";
import { validate } from "../../middlewares/validate.middleware";

const levelSlotSchema = z.object({
  level:       z.enum(["junior", "pleno", "senior"]),
  isLeader:    z.boolean().default(false),
  daysPerWeek: z.number().int().min(1).max(5),
  visitDays:   z.array(z.number().int().min(1).max(5)).default([]),
});

const pinnedSlotSchema = z.object({
  consultantId: z.number().int().positive(),
  daysPerWeek:  z.number().int().min(1).max(5),
  visitDays:    z.array(z.number().int().min(1).max(5)).default([]),
  cadence:      z.enum(["weekly", "biweekly_odd", "biweekly_even"]).nullable().optional(),
});

const dateOrderRefinement = (d: { startDate: string; endDate: string }) =>
  d.startDate <= d.endDate;
const dateOrderError = { message: "startDate deve ser anterior ou igual a endDate", path: ["endDate"] };

const createSchema = z.object({
  acronym:     z.string().min(1).max(5),
  client:      z.string().min(1).max(200),
  status:      z.enum(["confirmed", "hot", "cold"]).default("cold"),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cadence:     z.enum(["weekly", "biweekly_odd", "biweekly_even"]).default("weekly"),
  notes:       z.string().nullable().optional(),
  levelSlots:  z.array(levelSlotSchema).default([]),
  pinnedSlots: z.array(pinnedSlotSchema).default([]),
}).refine(dateOrderRefinement, dateOrderError);

const updateSchema = z.object({
  acronym:     z.string().min(1).max(5).optional(),
  client:      z.string().min(1).max(200).optional(),
  status:      z.enum(["confirmed", "hot", "cold", "archived"]).optional(),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cadence:     z.enum(["weekly", "biweekly_odd", "biweekly_even"]).optional(),
  notes:       z.string().nullable().optional(),
  levelSlots:  z.array(levelSlotSchema).optional(),
  pinnedSlots: z.array(pinnedSlotSchema).optional(),
  leaderConsultantId: z.number().int().positive().nullable().optional(),
}).refine(
  (d) => !(d.startDate && d.endDate) || d.startDate <= d.endDate,
  dateOrderError,
);

const allocationsSchema = z.object({
  allocations: z.array(z.object({
    consultantId: z.number().int().positive(),
    weekday:      z.number().int().min(1).max(5),
    role:         z.string().default("consultor"),
  })),
});

export const projectRoutes = Router();

projectRoutes.get("/",                        projectController.list);
projectRoutes.get("/:id",                     projectController.getById);
projectRoutes.post("/",                        validate(createSchema),      projectController.create);
projectRoutes.put("/:id",                      validate(updateSchema),      projectController.update);
projectRoutes.patch("/:id",                    validate(updateSchema),      projectController.update);
projectRoutes.delete("/:id",                   projectController.remove);
projectRoutes.post("/:id/allocations",         validate(allocationsSchema), projectController.setAllocations);
projectRoutes.delete("/:id/allocations",       projectController.clearAllocations);
