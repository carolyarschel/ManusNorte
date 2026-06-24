import { Router } from "express";
import { absenceController } from "./absence.controller";

export const absenceRoutes = Router();

absenceRoutes.get("/",                             absenceController.listAll);
absenceRoutes.get("/consultant/:consultantId",     absenceController.listByConsultant);
absenceRoutes.post("/",                            absenceController.create);
absenceRoutes.put("/:id",                          absenceController.update);
absenceRoutes.patch("/:id",                        absenceController.update);
absenceRoutes.delete("/:id",                       absenceController.remove);
