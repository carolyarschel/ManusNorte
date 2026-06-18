import { Request, Response, NextFunction } from "express";
import { simulationService } from "./simulation.service";

export const simulationController = {
  /** POST /api/simulation — batch simulate multiple projects */
  async simulate(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectIds, randomize, extraCommitted } = req.body;
      const results = await simulationService.simulateBatch(
        projectIds,
        randomize === true,
        extraCommitted ?? [],
      );
      res.json(results);
    } catch (err) {
      next(err);
    }
  },
};
