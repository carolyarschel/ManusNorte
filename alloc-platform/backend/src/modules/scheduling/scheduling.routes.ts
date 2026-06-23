import { Router } from "express";
import { z } from "zod";
import { schedulingController } from "./scheduling.controller";
import { validate } from "../../middlewares/validate.middleware";

const scheduleSchema = z.object({
  projectIds: z.array(z.number().int().positive()).min(1),
});

export const schedulingRoutes = Router();

/** POST /api/scheduling */
schedulingRoutes.post("/", validate(scheduleSchema), schedulingController.schedule);