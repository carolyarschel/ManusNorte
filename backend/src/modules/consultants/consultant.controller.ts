import { Request, Response, NextFunction } from "express";
import { consultantService } from "./consultant.service";

export const consultantController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await consultantService.getAll();
      res.json(data);
    } catch (err) { next(err); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await consultantService.getById(Number(req.params.id));
      res.json(data);
    } catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await consultantService.create(req.body);
      res.status(201).json(data);
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await consultantService.update(Number(req.params.id), req.body);
      res.json(data);
    } catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await consultantService.remove(Number(req.params.id));
      res.status(204).send();
    } catch (err) { next(err); }
  },

  async busyDays(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await consultantService.getBusyDays(Number(req.params.id));
      res.json(data);
    } catch (err) { next(err); }
  },
};
