import { useState, useCallback, useMemo, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { api, type SimulationResult } from "@/lib/api";
import {
  getProjectColor, isFullyAllocated,
  getMondayOfWeek, addDays, fmtDate, getISOWeek, jsDateToWeekday,
  DAY_NAMES, CADENCE_LABELS, LEVEL_LABELS,
} from "@/lib/domain";
import { StatusBadge, Avatar } from "@/components/ui/NorteUI";
import type { Project } from "@/types";

// Local types matching the API response
type SimResult = {
  feasible: boolean;
  issues: string[];
  suggestions: string[];
  proposed: ProposedAlloc[];
  earliestFeasibleDate?: string | null;
};
type ProposedAlloc = {
  consultantId: number;
  consultantName: string;
  weekday: number;
  role: string;
  slotDescription: string;
};

function apiResultToSimResult(
  projectId: number,
  apiResult: SimulationResult,
  consultants: { id: number; name: string }[],
): SimResult {
  const r = apiResult.results.find((x) => x.projectId === projectId);
  if (!r) return { feasible: false, issues: ["Sem resultado"], suggestions: [], proposed: [], earliestFeasibleDate: null };
  const proposed: ProposedAlloc[] = r.allocations.map((a) => {
    const c = consultants.find((x) => x.id === a.consultantId);
    return {
      consultantId: a.consultantId,
      consultantName: c?.name ?? `#${a.consultantId}`,
      weekday: a.weekday,
      role: a.role,
      slotDescription: `${DAY_NAMES[a.weekday]} · ${a.role}`,
    };
  });
  return {
    feasible: r.feasible,
    issues: r.issues ?? [],
    suggestions: r.suggestions ?? [],
    proposed,
    earliestFeasibleDate: r.suggestedStartDate ?? null,
  };
}

export default function SimulationPage() {
  const { consultants, projects, updateProject, loadAll } = useAppStore();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [simResults, setSimResults] = useState<Record<number, SimResult>>({});
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [applyLoading, setApplyLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [previewWeekStart, setPreviewWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [globalSimLoading, setGlobalSimLoading] = useState(false);
  const [globalSimStatus, setGlobalSimStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedIds.length || !Object.keys(simResults).length) return;
    const startDates = selectedIds.map((id) => projects.find((p) => p.id === id)?.startDate).filter((d): d is string => !!d);
    if (!startDates.length) return;
    const earliest = startDates.reduce((min, d) => (d < min ? d : min));
    const targetMonday = getMondayOfWeek(new Date(earliest));
    setPreviewWeekStart((cur) => (cur < targetMonday ? targetMonday : cur));
  }, [simResults]); // eslint-disable-line react-hooks/exhaustive-deps

  const consultantIndexMap = useMemo(() => new Map(consultants.map((c, i) => [c.id, i])), [consultants]);
  const simulatable = useMemo(() => projects.filter((p) => p.status !== "archived").filter((p) => !isFullyAllocated(p)), [projects]);

  const runBatch = useCallback(async (projectIds: number[], _randomize = false) => {
    if (!projectIds.length) return;
    setLoadingIds(new Set(projectIds));
    setSimError(null);
    try {
      const apiResult = await api.simulation.run({ projectIds });
      const newResults: Record<number, SimResult> = {};
      for (const id of projectIds) {
        newResults[id] = apiResultToSimResult(id, apiResult, consultants);
      }
      setSimResults((prev) => ({ ...prev, ...newResults }));
    } catch (err: unknown) {
      setSimError((err as Error).message ?? "Erro na simulação");
    } finally {
      setLoadingIds(new Set());
    }
  }, [consultants]);

  function handleSelect(id: number) {
    if (selectedIds.includes(id)) {
      const newIds = selectedIds.filter((x) => x !== id);
      setSelectedIds(newIds);
      setSimResults((prev) => { const next = { ...prev }; delete next[id]; return next; });
      const toSim = newIds.filter((x) => !appliedIds.has(x));
      if (toSim.length) runBatch(toSim);
      return;
    }
    const newIds = [...selectedIds, id];
    setSelectedIds(newIds);
    runBatch(newIds.filter((x) => !appliedIds.has(x)));
  }

  const handleApply = useCallback(async (projectId: number) => {
    const result = simResults[projectId];
    if (!result?.feasible || appliedIds.has(projectId)) return;
    setApplyLoading(true); setSimError(null);
    try {
      await api.projects.setAllocations(projectId, result.proposed.map((a) => ({ consultantId: a.consultantId, weekday: a.weekday, role: a.role })));
      const newApplied = new Set([...Array.from(appliedIds), projectId]);
      setAppliedIds(newApplied);
      await loadAll();
      const remaining = selectedIds.filter((id) => !newApplied.has(id));
      if (remaining.length) runBatch(remaining);
    } catch (err: unknown) { setSimError((err as Error).message ?? "Erro ao aplicar"); } finally { setApplyLoading(false); }
  }, [simResults, appliedIds, loadAll, selectedIds, runBatch]);

  const handleApplyAll = useCallback(async () => {
    const toApply = selectedIds.filter((id) => !appliedIds.has(id) && simResults[id]?.feasible);
    if (!toApply.length) return;
    setApplyLoading(true); setSimError(null);
    try {
      for (const id of toApply) {
        const result = simResults[id];
        if (!result?.feasible) continue;
        await api.projects.setAllocations(id, result.proposed.map((a) => ({ consultantId: a.consultantId, weekday: a.weekday, role: a.role })));
      }
      const newApplied = new Set([...Array.from(appliedIds), ...toApply]);
      setAppliedIds(newApplied);
      await loadAll();
    } catch (err: unknown) { setSimError((err as Error).message ?? "Erro ao aplicar todos"); } finally { setApplyLoading(false); }
  }, [selectedIds, appliedIds, simResults, loadAll]);

  const handleRefreshOne = useCallback(async (projectId: number) => {
    setLoadingIds(new Set([projectId])); setSimError(null);
    try {
      const allToSim = selectedIds.filter((id) => !appliedIds.has(id));
      const apiResult = await api.simulation.run({ projectIds: allToSim });
      const newResults: Record<number, SimResult> = {};
      for (const id of allToSim) {
        newResults[id] = apiResultToSimResult(id, apiResult, consultants);
      }
      setSimResults((prev) => ({ ...prev, ...newResults }));
    } catch (err: unknown) { setSimError((err as Error).message ?? "Erro na simulação"); } finally { setLoadingIds(new Set()); }
  }, [selectedIds, appliedIds, consultants]);

  const handleShiftDates = useCallback(async (projectId: number, newStartDate: string) => {
    const p = projects.find((x) => x.id === projectId);
    if (!p) return;
    const offsetMs = new Date(newStartDate).getTime() - new Date(p.startDate).getTime();
    const offsetDays = Math.round(offsetMs / 86_400_000);
    const newEnd = new Date(new Date(p.endDate).getTime() + offsetDays * 86_400_000).toISOString().split("T")[0];
    setApplyLoading(true); setSimError(null);
    try {
      await updateProject(projectId, { startDate: newStartDate, endDate: newEnd });
      await loadAll();
      const toSim = selectedIds.filter((id) => !appliedIds.has(id));
      if (toSim.length) runBatch(toSim);
    } catch (err: unknown) { setSimError((err as Error).message ?? "Erro ao alterar datas"); } finally { setApplyLoading(false); }
  }, [projects, updateProject, loadAll, selectedIds, appliedIds, runBatch]);

  type ChipEntry = { projectAcronym: string; role: string; color: { bg: string; border: string; text: string }; isProposed: boolean };
  function getPreviewChips(consultantId: number, date: Date): ChipEntry[] {
    const weekday = jsDateToWeekday(date);
    if (!weekday) return [];
    const chips: ChipEntry[] = [];
    const beingSimulated = new Set(selectedIds.filter((id) => !appliedIds.has(id)));
    for (const p of projects) {
      if (p.status === "archived") continue;
      if (beingSimulated.has(p.id)) {
        const proposals = simResults[p.id]?.proposed ?? [];
        if (proposals.some((pa: ProposedAlloc) => pa.consultantId === consultantId && pa.weekday === weekday)) continue;
      }
      const start = new Date(p.startDate), end = new Date(p.endDate);
      if (date < start || date > end) continue;
      if (p.cadence === "biweekly_odd"  && getISOWeek(date) % 2 === 0) continue;
      if (p.cadence === "biweekly_even" && getISOWeek(date) % 2 === 1) continue;
      const col = getProjectColor(p.id, projects);
      if ((p.allocations ?? []).length > 0) {
        const alloc = p.allocations!.find((a) => a.consultantId === consultantId && a.weekday === weekday);
        if (alloc) chips.push({ projectAcronym: p.acronym, role: alloc.role, color: col, isProposed: false });
      } else if ((p.allocatedConsultants ?? []).includes(consultantId) && (p.visitDays ?? []).includes(weekday)) {
        chips.push({ projectAcronym: p.acronym, role: "Consultor", color: col, isProposed: false });
      }
    }
    for (const id of selectedIds) {
      if (appliedIds.has(id)) continue;
      const result = simResults[id];
      if (!result?.feasible) continue;
      const p = projects.find((x) => x.id === id);
      if (!p) continue;
      const start = new Date(p.startDate), end = new Date(p.endDate);
      if (date < start || date > end) continue;
      if (p.cadence === "biweekly_odd"  && getISOWeek(date) % 2 === 0) continue;
      if (p.cadence === "biweekly_even" && getISOWeek(date) % 2 === 1) continue;
      const col = getProjectColor(p.id, projects);
      const alloc = result.proposed.find((a: ProposedAlloc) => a.consultantId === consultantId && a.weekday === weekday);
      if (alloc) chips.push({ projectAcronym: p.acronym, role: alloc.role, color: col, isProposed: true });
    }
    return chips;
  }

  const handleSimulateAll = useCallback(async () => {
    const targets = simulatable.map((p) => p.id);
    if (!targets.length) return;
    setGlobalSimLoading(true); setGlobalSimStatus("Simulando..."); setSimError(null);
    try {
      const allIds = Array.from(new Set([...selectedIds, ...targets]));
      setSelectedIds(allIds);
      const toSim = allIds.filter((id) => !appliedIds.has(id));
      const apiResult = await api.simulation.run({ projectIds: toSim });
      const newResults: Record<number, SimResult> = {};
      for (const id of toSim) {
        newResults[id] = apiResultToSimResult(id, apiResult, consultants);
      }
      setSimResults((prev) => ({ ...prev, ...newResults }));
      const feasibleCount = toSim.filter((id) => newResults[id]?.feasible).length;
      setGlobalSimStatus(feasibleCount > 0 ? `Simulação concluída — ${feasibleCount} projeto${feasibleCount === 1 ? "" : "s"} viável${feasibleCount === 1 ? "" : "is"}. Use "Alocar pessoas" para confirmar.` : `Simulação concluída. Nenhum projeto viável encontrado.`);
    } catch (err: unknown) { setSimError((err as Error).message ?? "Erro na simulação global"); setGlobalSimStatus(null); } finally { setGlobalSimLoading(false); }
  }, [simulatable, selectedIds, appliedIds, consultants]);

  const anyLoading = applyLoading || loadingIds.size > 0 || globalSimLoading;
  const feasibleCount = selectedIds.filter((id) => !appliedIds.has(id) && simResults[id]?.feasible).length;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Simulação</div>
          {globalSimStatus && (<div className="topbar-sub" style={{ color: globalSimStatus.startsWith("✅") ? "#1e8449" : "var(--muted)" }}>{globalSimStatus}</div>)}
        </div>
        <button className="btn btn-primary" onClick={handleSimulateAll} disabled={anyLoading || simulatable.length === 0} title="Selecionar e simular todos os projetos não completamente alocados">
          {globalSimLoading ? "Simulando..." : "Simular Todos"}
        </button>
      </div>
      <div className="page-content">
        <div className="grid-2" style={{ alignItems: "start", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Projetos ({selectedIds.length} selecionados)</span>
              {feasibleCount > 0 && (<button className="btn btn-primary btn-sm" onClick={handleApplyAll} disabled={anyLoading}>✓ Alocar todos ({feasibleCount})</button>)}
            </div>
            {simulatable.map((p: Project) => {
              const isSelected = selectedIds.includes(p.id);
              const isApplied = appliedIds.has(p.id);
              return (
                <div key={p.id} onClick={() => !isApplied && handleSelect(p.id)} style={{ padding: "11px 13px", borderRadius: 8, cursor: isApplied ? "default" : "pointer", marginBottom: 6, background: isSelected ? "#fff5f4" : "#fff", border: `1.5px solid ${isSelected ? "var(--red)" : "var(--border)"}`, opacity: isApplied ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={isSelected} disabled={isApplied} onChange={() => {}} style={{ accentColor: "var(--red)", width: 16, height: 16 }} />
                      <div>
                        <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", marginRight: 8, fontSize: 15 }}>{p.acronym}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{p.client}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isApplied && (<span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#eafaf1", color: "#1e8449", fontWeight: 600 }}>✓ Alocado</span>)}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, paddingLeft: 24 }}>{p.startDate} → {p.endDate} · {CADENCE_LABELS[p.cadence]}</div>
                </div>
              );
            })}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 11, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Resultados</div>
            {simError && (<div className="sim-result warn" style={{ marginBottom: 12 }}><div style={{ fontSize: 13, color: "#c0392b" }}>❌ {simError}</div></div>)}
            {selectedIds.length === 0 && (<div className="card"><div className="empty-state">Selecione projetos para simular</div></div>)}
            {selectedIds.map((id) => {
              const p = projects.find((x) => x.id === id);
              const result = simResults[id];
              const isApplied = appliedIds.has(id);
              const isLoading = loadingIds.has(id);
              if (!p) return null;
              return (
                <div key={id} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", fontSize: 16 }}>{p.acronym}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--muted)" }}>{p.client}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.startDate} → {p.endDate}</span>
                    </div>
                    {!isApplied && (<button className="btn btn-secondary btn-sm" onClick={() => handleRefreshOne(id)} disabled={anyLoading} title="Gerar nova sugestão">🔄 Nova sugestão</button>)}
                  </div>
                  {isLoading && (<div className="card" style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 13 }}>Simulando {loadingIds.size} projeto{loadingIds.size !== 1 ? "s" : ""} em conjunto...</div>)}
                  {!result && !isLoading && (<div className="card" style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>Aguardando simulação...</div>)}
                  {result && !isLoading && (
                    <>
                      <div className={`sim-result ${result.feasible ? "ok" : "warn"}`}>
                        <div style={{ fontFamily: "var(--font-hd)", fontWeight: 700, fontSize: 14, marginBottom: 6, color: result.feasible ? "#1e8449" : "#c0392b" }}>
                          {result.feasible ? "✅ Viável na data original" : "⚠️ Inviável na data original"}
                        </div>
                        {result.issues.map((iss: string, i: number) => (<div key={i} style={{ fontSize: 13, color: "#c0392b", marginBottom: 3 }}>• {iss}</div>))}
                        {result.suggestions.map((s: string, i: number) => (<div key={i} style={{ fontSize: 13, color: "#1e8449", marginBottom: 3 }}>✓ {s}</div>))}
                        {result.feasible ? (
                          <div style={{ marginTop: 8, padding: "7px 11px", background: "#eafaf1", borderRadius: 6, fontSize: 13, color: "#1e8449", fontWeight: 600 }}>📅 Início possível: <strong>{p.startDate}</strong><span style={{ fontWeight: 400, marginLeft: 6 }}>— na data prevista</span></div>
                        ) : result.earliestFeasibleDate ? (
                          <div style={{ marginTop: 8, padding: "7px 11px", background: "#fef9e7", borderRadius: 6, fontSize: 13, color: "#e67e22", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <span>📅 Data mais próxima viável: <strong>{result.earliestFeasibleDate}</strong></span>
                            <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} disabled={anyLoading} onClick={() => handleShiftDates(id, result.earliestFeasibleDate!)}>Usar esta data →</button>
                          </div>
                        ) : (
                          <div style={{ marginTop: 8, padding: "7px 11px", background: "#fdedec", borderRadius: 6, fontSize: 13, color: "#c0392b", fontWeight: 600 }}>📅 Sem data viável nas próximas 26 semanas</div>
                        )}
                      </div>
                      {result.proposed.length > 0 && (
                        <div className="card" style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <div className="card-title" style={{ margin: 0 }}>Time Sugerido</div>
                            {result.feasible && !isApplied && (<button className="btn btn-primary btn-sm" onClick={() => handleApply(id)} disabled={applyLoading}>✓ Alocar pessoas</button>)}
                            {isApplied && (<span style={{ fontSize: 12, color: "#1e8449", fontWeight: 600 }}>✅ Alocado e confirmado</span>)}
                          </div>
                          {(() => {
                            const grouped = new Map<number, ProposedAlloc[]>();
                            for (const a of result.proposed) {
                              if (!grouped.has(a.consultantId)) grouped.set(a.consultantId, []);
                              grouped.get(a.consultantId)!.push(a);
                            }
                            return Array.from(grouped.entries()).map(([cId, allocs]) => {
                              const ci = consultantIndexMap.get(cId) ?? 0;
                              return (
                                <div key={cId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                                  <Avatar name={allocs[0].consultantName} index={ci >= 0 ? ci : 0} size={28} />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{allocs[0].consultantName}</div>
                                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{allocs[0].slotDescription}</div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2e86c1" }}>{allocs.map((a: ProposedAlloc) => DAY_NAMES[a.weekday]).join(", ")}</div>
                                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{allocs.length}x/sem · {allocs[0].role}</div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {selectedIds.length > 0 && Object.keys(simResults).length > 0 && (() => {
          const previewDays = [0, 1, 2, 3, 4].map((i) => addDays(previewWeekStart, i));
          const weekEnd = previewDays[4];
          const relevantConsultants = consultants.filter((c) => previewDays.some((d) => getPreviewChips(c.id, d).length > 0));
          return (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div className="card-title" style={{ margin: 0, flex: 1 }}>Calendário da Simulação</div>
                <button className="btn btn-secondary btn-sm" onClick={() => setPreviewWeekStart((d) => addDays(d, -7))}>‹ Anterior</button>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 170, textAlign: "center", color: "var(--muted)" }}>Semana {getISOWeek(previewWeekStart)} · {fmtDate(previewWeekStart)}–{fmtDate(weekEnd)}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setPreviewWeekStart((d) => addDays(d, 7))}>Próximo ›</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPreviewWeekStart(getMondayOfWeek(new Date()))}>Hoje</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {selectedIds.map((id) => {
                  const p = projects.find((x) => x.id === id);
                  if (!p) return null;
                  const col = getProjectColor(p.id, projects);
                  const pStart = new Date(p.startDate), pEnd = new Date(p.endDate);
                  const isActive = pStart <= weekEnd && pEnd >= previewWeekStart;
                  return (
                    <span key={id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: isActive ? col.bg : "transparent", color: isActive ? col.text : "var(--muted)", border: `1.5px ${isActive ? "solid" : "dashed"} ${isActive ? col.border : "var(--border)"}` }}>
                      {isActive ? "●" : "○"} {p.acronym} · {p.startDate} → {p.endDate}
                    </span>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: "var(--muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 20, height: 10, background: "#d6eaf8", border: "2px solid #2e86c1", borderRadius: 2 }} />Confirmado</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 20, height: 10, background: "#d6eaf8", border: "2px dashed #2e86c1", borderRadius: 2 }} />Proposta da simulação</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="cal-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", width: 150 }}>Consultor</th>
                      {previewDays.map((d, i) => (<th key={i}><span className="cal-th-day">{DAY_NAMES[i + 1]} {fmtDate(d)}</span></th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {relevantConsultants.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>Nenhum consultor alocado nesta semana — navegue para o período do projeto</td></tr>
                    ) : (
                      relevantConsultants.map((c) => {
                        const ci = consultantIndexMap.get(c.id) ?? 0;
                        return (
                          <tr key={c.id}>
                            <td style={{ padding: "8px 10px", background: "var(--surface)" }}>
                              <div className="cal-consultant">
                                <Avatar name={c.name} index={ci} size={26} />
                                <div>
                                  <div className="cal-name" style={{ fontSize: 12 }}>{c.name.split(" ")[0]}</div>
                                  <div className="cal-sub" style={{ fontSize: 10 }}>{LEVEL_LABELS[c.level]}{c.isLeader ? " ★" : ""}</div>
                                </div>
                              </div>
                            </td>
                            {previewDays.map((date, di) => {
                              const chips = getPreviewChips(c.id, date);
                              const isRestricted = c.restrictions.includes((di + 1) as 1|2|3|4|5);
                              const hasConflict = chips.length > 1;
                              return (
                                <td key={di}>
                                  <div className={`cal-cell${isRestricted && !chips.length ? " restricted" : ""}`} style={{ minHeight: 40, background: hasConflict ? "#fff0f0" : undefined }}>
                                    {isRestricted && !chips.length && <span className="restricted-dot" style={{ marginTop: 12 }} />}
                                    {chips.map((e: ChipEntry, i: number) => (
                                      <div key={i} className="cal-chip" style={{ background: e.color.bg, color: e.color.text, borderStyle: e.isProposed ? "dashed" : "solid", borderTopWidth: e.isProposed ? "1.5px" : undefined, borderRightWidth: e.isProposed ? "1.5px" : undefined, borderBottomWidth: e.isProposed ? "1.5px" : undefined, borderLeftWidth: e.isProposed ? "3px" : undefined, borderTopColor: e.color.border, borderRightColor: e.color.border, borderBottomColor: e.color.border, borderLeftColor: e.color.border }}>
                                        <span className="cal-chip-acronym">{e.projectAcronym}</span>
                                        <span className="cal-chip-role">— {e.role}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
