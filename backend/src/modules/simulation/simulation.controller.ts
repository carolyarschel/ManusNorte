import { Request, Response, NextFunction } from "express";
import { simulationService } from "./simulation.service";

export const simulationController = {
  /** POST /api/simulation — batch simulate multiple projects */
  async simulate(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectIds, randomize, extraCommitted } = req.body;
      const rawResults = await simulationService.simulateBatch(
        projectIds,
        randomize === true,
        extraCommitted ?? [],
      );
      const results = Object.entries(rawResults).map(([id, r]) => ({
        projectId:          Number(id),
        feasible:           r.feasible,
        allocations:        r.proposed.map((a) => ({ consultantId: a.consultantId, weekday: a.weekday, role: a.role })),
        issues:             r.issues,
        suggestions:        r.suggestions,
        warnings:           [] as string[],
        suggestedStartDate: r.earliestFeasibleDate ?? null,
      }));
      res.json({ results });
    } catch (err) {
      next(err);
    }
  },
};
