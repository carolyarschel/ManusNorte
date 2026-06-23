import { Router } from "express";
import { z } from "zod";
import { consultantController } from "./consultant.controller";
import { validate } from "../../middlewares/validate.middleware";

const freeDaysRefinement = (d: { maxDays?: number; restrictions?: number[] }) => {
  if (d.maxDays !== undefined && d.restrictions !== undefined) {
    return d.maxDays <= 5 - d.restrictions.length;
  }
  return true;
};
const freeDaysError = (d: { maxDays?: number; restrictions?: number[] }) => ({
  message: `maxDays (${d.maxDays}) não pode exceder os dias livres (${5 - (d.restrictions?.length ?? 0)})`,
  path: ["maxDays"],
});

const createSchema = z.object({
  name:         z.string().min(2).max(200),
  level:        z.enum(["junior", "pleno", "senior"]),
  isLeader:     z.boolean().default(false),
  maxDays:      z.number().int().min(1).max(5).default(5),
  restrictions: z.array(z.number().int().min(1).max(5))
    .refine((arr) => arr.length === new Set(arr).size, { message: "Restrições contêm dias duplicados" })
    .default([]),
}).refine(freeDaysRefinement, freeDaysError);

const updateSchema = z.object({
  name:         z.string().min(2).max(200).optional(),
  level:        z.enum(["junior", "pleno", "senior"]).optional(),
  isLeader:     z.boolean().optional(),
  maxDays:      z.number().int().min(1).max(5).optional(),
  restrictions: z.array(z.number().int().min(1).max(5))
    .refine((arr) => arr.length === new Set(arr).size, { message: "Restrições contêm dias duplicados" })
    .optional(),
}).refine(freeDaysRefinement, freeDaysError);

export const consultantRoutes = Router();

consultantRoutes.get("/",          consultantController.list);
consultantRoutes.get("/:id",       consultantController.getById);
consultantRoutes.get("/:id/busy",  consultantController.busyDays);
consultantRoutes.post("/",         validate(createSchema), consultantController.create);
consultantRoutes.put("/:id",       validate(updateSchema), consultantController.update);
consultantRoutes.delete("/:id",    consultantController.remove);
