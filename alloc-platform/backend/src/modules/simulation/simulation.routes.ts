import { Router } from "express";
import { z } from "zod";
import { simulationController } from "./simulation.controller";
import { validate } from "../../middlewares/validate.middleware";

const extraCommittedEntrySchema = z.object({
  consultantId: z.number().int().positive(),
  weekday:      z.number().int().min(1).max(5),
  cadence:      z.enum(["weekly", "biweekly_odd", "biweekly_even"]),
  startDate:    z.string(),
  endDate:      z.string(),
  projectId:    z.number().int().positive(),
});

const batchSchema = z.object({
  projectIds:     z.array(z.number().int().positive()).min(1).max(10),
  randomize:      z.boolean().optional().default(false),
  extraCommitted: z.array(extraCommittedEntrySchema).optional().default([]),
});

export const simulationRoutes = Router();

// POST /api/simulation — batch simulate 1+ projects together
simulationRoutes.post("/", validate(batchSchema), simulationController.simulate);
