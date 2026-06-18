import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // Postgres unique-violation and other driver errors
  if (err.code === "23505") {
    res.status(409).json({ error: "Registro duplicado" });
    return;
  }

  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
}
