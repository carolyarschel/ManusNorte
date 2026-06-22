import { Request, Response, NextFunction } from "express";
import { schedulingService } from "./scheduling.service";

export const schedulingController = {
  /** POST /api/scheduling — score, order, and suggest dates for hot/cold projects */
  async schedule(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await schedulingService.schedule(req.body.projectIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};