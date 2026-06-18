import { Request, Response, NextFunction } from "express";
import { projectService } from "./project.service";

export const projectController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try { res.json(await projectService.getAll()); }
    catch (err) { next(err); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try { res.json(await projectService.getById(Number(req.params.id))); }
    catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json(await projectService.create(req.body)); }
    catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try { res.json(await projectService.update(Number(req.params.id), req.body)); }
    catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try { await projectService.remove(Number(req.params.id)); res.status(204).send(); }
    catch (err) { next(err); }
  },

  async setAllocations(req: Request, res: Response, next: NextFunction) {
    try { res.json(await projectService.setAllocations(Number(req.params.id), req.body.allocations)); }
    catch (err) { next(err); }
  },

  async clearAllocations(req: Request, res: Response, next: NextFunction) {
    try { res.json(await projectService.clearAllocations(Number(req.params.id))); }
    catch (err) { next(err); }
  },
};
