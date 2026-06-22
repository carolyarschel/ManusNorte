import express from "express";
import cors from "cors";
import { consultantRoutes }  from "./modules/consultants/consultant.routes";
import { projectRoutes }     from "./modules/projects/project.routes";
import { simulationRoutes }  from "./modules/simulation/simulation.routes";
import { schedulingRoutes }  from "./modules/scheduling/scheduling.routes";
import { absenceRoutes }     from "./modules/absences/absence.routes";
import { errorHandler }      from "./middlewares/error.middleware";

const app = express();

// ── Middlewares ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ["http://localhost:3000"], credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 500 ? "\x1b[31m" : res.statusCode >= 400 ? "\x1b[33m" : "\x1b[32m";
    console.log(`${color}${req.method}\x1b[0m ${req.url} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/consultants", consultantRoutes);
app.use("/api/projects",    projectRoutes);
app.use("/api/simulation",  simulationRoutes);
app.use("/api/scheduling",  schedulingRoutes);
app.use("/api/absences",    absenceRoutes);

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

export default app;