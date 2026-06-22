import { Request, Response, NextFunction } from "express";
import { absenceRepo } from "./absence.repository";
import { NotFoundError } from "../../lib/errors";

function toDTO(row: { id: number; consultant_id: number; start_date: string; end_date: string; reason: string | null }) {
  return {
    id:           row.id,
    consultantId: row.consultant_id,
    startDate:    String(row.start_date).slice(0, 10),
    endDate:      String(row.end_date).slice(0, 10),
    reason:       row.reason ?? null,
  };
}

export const absenceController = {
  async listAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await absenceRepo.findAll();
      res.json(rows.map(toDTO));
    } catch (err) { next(err); }
  },

  async listByConsultant(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await absenceRepo.findByConsultant(Number(req.params.consultantId));
      res.json(rows.map(toDTO));
    } catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { consultantId, startDate, endDate, reason } = req.body;
      const row = await absenceRepo.create({
        consultant_id: Number(consultantId),
        start_date:    startDate,
        end_date:      endDate,
        reason:        reason ?? null,
      });
      res.status(201).json(toDTO(row));
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const existing = await absenceRepo.findById(id);
      if (!existing) throw new NotFoundError("Ausência", id);

      const { startDate, endDate, reason } = req.body;
      const updateData: Parameters<typeof absenceRepo.update>[1] = {};
      if (startDate !== undefined) updateData.start_date = startDate;
      if (endDate !== undefined)   updateData.end_date   = endDate;
      if ("reason" in req.body)    updateData.reason     = reason ?? null;

      const row = await absenceRepo.update(id, updateData);
      res.json(toDTO(row!));
    } catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const deleted = await absenceRepo.remove(id);
      if (!deleted) throw new NotFoundError("Ausência", id);
      res.status(204).send();
    } catch (err) { next(err); }
  },
};
