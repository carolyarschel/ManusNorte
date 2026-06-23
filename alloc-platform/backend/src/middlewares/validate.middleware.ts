import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ValidationError } from "../lib/errors";

/** Validates req.body against a Zod schema. */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError("Dados inválidos", err.flatten().fieldErrors));
        return;
      }
      next(err);
    }
  };
}
