/**
 * REST routes for the NORTE frontend (api.ts calls /api/*)
 * These delegate to the same DB helpers used by tRPC procedures.
 */
import type { Express, Request, Response } from "express";
import { consultantDb, projectDb, allocationDb, absenceDb } from "./db";
import { simulationService } from "./simulation";
import { schedulingService } from "./scheduling";
import { runAgentChat, type ChatMessage } from "./agentChat";

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    });
  };
}

export function registerRestRoutes(app: Express) {
  // ── Consultants ────────────────────────────────────────────────────────────
  app.get("/api/consultants", wrap(async (_req, res) => {
    const rows = await consultantDb.findAll();
    res.json(rows);
  }));

  app.get("/api/consultants/:id", wrap(async (req, res) => {
    const c = await consultantDb.findById(Number(req.params.id));
    if (!c) return void res.status(404).json({ error: "Not found" });
    res.json(c);
  }));

  app.post("/api/consultants", wrap(async (req, res) => {
    const c = await consultantDb.create(req.body);
    res.status(201).json(c);
  }));

  app.patch("/api/consultants/:id", wrap(async (req, res) => {
    const c = await consultantDb.update(Number(req.params.id), req.body);
    res.json(c);
  }));
  app.put("/api/consultants/:id", wrap(async (req, res) => {
    const c = await consultantDb.update(Number(req.params.id), req.body);
    res.json(c);
  }));

  app.delete("/api/consultants/:id", wrap(async (req, res) => {
    await consultantDb.remove(Number(req.params.id));
    res.status(204).end();
  }));

  app.get("/api/consultants/:id/busy", wrap(async (req, res) => {
    // Return weekdays where this consultant is already allocated in confirmed projects
    const id = Number(req.params.id);
    const allProjects = await projectDb.findAll();
    const busyDays: number[] = [];
    for (const p of allProjects) {
      if (p.status !== "confirmed") continue;
      const allocs = await projectDb.getAllocations(p.id);
      for (const a of allocs) {
        if (a.consultantId === id && !busyDays.includes(a.weekday)) {
          busyDays.push(a.weekday);
        }
      }
    }
    res.json(busyDays.sort());
  }));

  // ── Projects ───────────────────────────────────────────────────────────────
  app.get("/api/projects", wrap(async (req, res) => {
    const rows = await projectDb.findAll();
    // Fetch all relations in parallel
    const allRelations = await Promise.all(rows.map(async (p) => ({
      project: p,
      allocations: await projectDb.getAllocations(p.id),
      pinnedSlots: await projectDb.getPinnedSlots(p.id),
      levelSlots: await projectDb.getLevelSlots(p.id),
    })));

    // If include=relations, return normalized format expected by the store
    if (req.query.include === "relations") {
      const projects = allRelations.map(({ project }) => project);
      const levelSlots = allRelations.flatMap(({ levelSlots: ls }) => ls);
      const pinnedSlots = allRelations.flatMap(({ pinnedSlots: ps }) => ps);
      const allocations = allRelations.flatMap(({ allocations: al }) => al);
      return void res.json({ projects, levelSlots, pinnedSlots, allocations });
    }

    // Default: return enriched array (used by other callers)
    const enriched = allRelations.map(({ project: p, allocations, pinnedSlots, levelSlots }) => ({
      ...p,
      allocations,
      pinnedSlots,
      levelSlots,
      allocatedConsultants: allocations.map((a) => a.consultantId),
    }));
    res.json(enriched);
  }));

  app.get("/api/projects/:id", wrap(async (req, res) => {
    const p = await projectDb.findById(Number(req.params.id));
    if (!p) return void res.status(404).json({ error: "Not found" });
    const id = p.id;
    res.json({
      ...p,
      allocations: await projectDb.getAllocations(id),
      pinnedSlots: await projectDb.getPinnedSlots(id),
      levelSlots: await projectDb.getLevelSlots(id),
      allocatedConsultants: (await projectDb.getAllocations(id)).map((a) => a.consultantId),
    });
  }));

  app.post("/api/projects", wrap(async (req, res) => {
    const { pinnedSlots: ps, levelSlots: ls, ...projectData } = req.body;
    const p = await projectDb.create(projectData);
    if (ps?.length) await projectDb.setPinnedSlots(p.id, ps.map((s: Record<string, unknown>) => ({ ...s, projectId: p.id })));
    if (ls?.length) await projectDb.setLevelSlots(p.id, ls.map((s: Record<string, unknown>) => ({ ...s, projectId: p.id })));
    res.status(201).json({ ...p, allocations: [], pinnedSlots: ps ?? [], levelSlots: ls ?? [], allocatedConsultants: [] });
  }));

  app.patch("/api/projects/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { pinnedSlots: ps, levelSlots: ls, ...projectData } = req.body;
    const p = await projectDb.update(id, projectData);
    if (ps !== undefined) await projectDb.setPinnedSlots(id, ps.map((s: Record<string, unknown>) => ({ ...s, projectId: id })));
    if (ls !== undefined) await projectDb.setLevelSlots(id, ls.map((s: Record<string, unknown>) => ({ ...s, projectId: id })));
    res.json({
      ...p,
      allocations: await projectDb.getAllocations(id),
      pinnedSlots: await projectDb.getPinnedSlots(id),
      levelSlots: await projectDb.getLevelSlots(id),
      allocatedConsultants: (await projectDb.getAllocations(id)).map((a) => a.consultantId),
    });
  }));
  app.put("/api/projects/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { pinnedSlots: ps, levelSlots: ls, ...projectData } = req.body;
    const p = await projectDb.update(id, projectData);
    if (ps !== undefined) await projectDb.setPinnedSlots(id, ps.map((s: Record<string, unknown>) => ({ ...s, projectId: id })));
    if (ls !== undefined) await projectDb.setLevelSlots(id, ls.map((s: Record<string, unknown>) => ({ ...s, projectId: id })));
    res.json({
      ...p,
      allocations: await projectDb.getAllocations(id),
      pinnedSlots: await projectDb.getPinnedSlots(id),
      levelSlots: await projectDb.getLevelSlots(id),
      allocatedConsultants: (await projectDb.getAllocations(id)).map((a) => a.consultantId),
    });
  }));

  // Full update (project + slots together)
  app.put("/api/projects/:id/full", wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { pinnedSlots: ps, levelSlots: ls, ...projectData } = req.body;
    const p = await projectDb.update(id, projectData);
    if (ps !== undefined) await projectDb.setPinnedSlots(id, ps.map((s: Record<string, unknown>) => ({ ...s, projectId: id })));
    if (ls !== undefined) await projectDb.setLevelSlots(id, ls.map((s: Record<string, unknown>) => ({ ...s, projectId: id })));
    res.json({
      ...p,
      allocations: await projectDb.getAllocations(id),
      pinnedSlots: await projectDb.getPinnedSlots(id),
      levelSlots: await projectDb.getLevelSlots(id),
      allocatedConsultants: (await projectDb.getAllocations(id)).map((a) => a.consultantId),
    });
  }));

  app.delete("/api/projects/:id", wrap(async (req, res) => {
    await projectDb.remove(Number(req.params.id));
    res.status(204).end();
  }));

  app.post("/api/projects/:id/allocations", wrap(async (req, res) => {
    const id = Number(req.params.id);
    const raw = (Array.isArray(req.body) ? req.body : req.body?.allocations) ?? [];
    const normalized = raw.map((a: { consultantId: number; weekday: number; role: string }) => ({
      consultantId: a.consultantId,
      weekday: a.weekday,
      role: (a.role === "lider" || a.role === "líder") ? "líder" as const : "consultor" as const,
    }));
    await allocationDb.setForProject(id, normalized);
    res.json({ success: true });
  }));
  app.put("/api/projects/:id/allocations", wrap(async (req, res) => {
    const id = Number(req.params.id);
    const raw = (Array.isArray(req.body) ? req.body : req.body?.allocations) ?? [];
    const normalized = raw.map((a: { consultantId: number; weekday: number; role: string }) => ({
      consultantId: a.consultantId,
      weekday: a.weekday,
      role: (a.role === "lider" || a.role === "líder") ? "líder" as const : "consultor" as const,
    }));
    await allocationDb.setForProject(id, normalized);
    res.json({ success: true });
  }));

  app.delete("/api/projects/:id/allocations", wrap(async (req, res) => {
    await allocationDb.clearForProject(Number(req.params.id));
    res.json({ success: true });
  }));

  // ── Absences ───────────────────────────────────────────────────────────────
  app.get("/api/absences", wrap(async (_req, res) => {
    res.json(await absenceDb.findAll());
  }));

  app.get("/api/absences/consultant/:id", wrap(async (req, res) => {
    res.json(await absenceDb.findByConsultant(Number(req.params.id)));
  }));

  app.post("/api/absences", wrap(async (req, res) => {
    const a = await absenceDb.create(req.body);
    res.status(201).json(a);
  }));

  app.patch("/api/absences/:id", wrap(async (req, res) => {
    const a = await absenceDb.update(Number(req.params.id), req.body);
    res.json(a);
  }));
  app.put("/api/absences/:id", wrap(async (req, res) => {
    const a = await absenceDb.update(Number(req.params.id), req.body);
    res.json(a);
  }));

  app.delete("/api/absences/:id", wrap(async (req, res) => {
    await absenceDb.remove(Number(req.params.id));
    res.status(204).end();
  }));

  // ── Simulation ─────────────────────────────────────────────────────────────
  app.post("/api/simulation", wrap(async (req, res) => {
    const { projectIds, randomize, extraCommitted } = req.body as { projectIds: number[]; randomize?: boolean; extraCommitted?: unknown[] };
    const results = await simulationService.simulateBatch(projectIds, randomize ?? false, (extraCommitted ?? []) as any);
    res.json(results);
  }));
  app.post("/api/simulation/run", wrap(async (req, res) => {
    const { projectIds, randomize } = req.body as { projectIds: number[]; randomize?: boolean };
    const results = await simulationService.simulateBatch(projectIds, randomize ?? false);
    // Convert Record<number, SimResult> to array format the frontend expects
    const output = projectIds.map((id) => {
      const r = results[id];
      return {
        projectId: id,
        feasible: r?.feasible ?? false,
        allocations: (r?.proposed ?? []).map((a) => ({
          consultantId: a.consultantId,
          weekday: a.weekday,
          role: a.role,
        })),
        issues: r?.issues ?? [],
        suggestions: r?.suggestions ?? [],
        warnings: [...(r?.issues ?? []), ...(r?.suggestions ?? [])],
        suggestedStartDate: r?.earliestFeasibleDate ?? null,
      };
    });
    res.json({ results: output });
  }));

  // ── Scheduling ─────────────────────────────────────────────────────────────
  app.post("/api/scheduling", wrap(async (req, res) => {
    const { projectIds } = req.body as { projectIds: number[] };
    const results = await schedulingService.schedule(projectIds);
    res.json({ results });
  }));
  app.post("/api/scheduling/run", wrap(async (req, res) => {
    const { projectIds } = req.body as { projectIds: number[] };
    const results = await schedulingService.schedule(projectIds);
    res.json({ results });
  }));

  // ── Agent ──────────────────────────────────────────────────────────────────
  app.post("/api/agent/chat", wrap(async (req, res) => {
    const { history } = req.body as { history: ChatMessage[] };
    if (!Array.isArray(history)) {
      return void res.status(400).json({ error: "history deve ser um array de mensagens" });
    }
    const reply = await runAgentChat(history);
    res.json({ reply });
  }));
}
