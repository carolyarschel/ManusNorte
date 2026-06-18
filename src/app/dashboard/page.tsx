"use client";

import { useState, useRef, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { detectConflicts, getISOWeek, DAY_NAMES, remainingCapacity } from "@/lib/domain";
import { StatusBadge } from "@/components/ui";
import { isWorkingDay } from "@/lib/holidays";
import type { Consultant, Project } from "@/types";

const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const WEEKDAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const GANTT_COLORS: Record<string, string> = {
  confirmed: "#c0392b", hot: "#e67e22", cold: "#95a5a6",
};
const STATUS_ORDER: Record<string, number> = { confirmed: 0, hot: 1, cold: 2 };
const CHART_H = 80;

function computeMonthlyOccupancy(
  consultants: { id: number; maxDays: number }[],
  projects: {
    status: string; startDate: string; endDate: string; cadence: string;
    allocations?: { consultantId: number; weekday: number }[];
  }[],
  month: Date,
) {
  const y = month.getFullYear(), m = month.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd   = new Date(y, m + 1, 0);

  let workingDays = 0;
  { const d = new Date(monthStart);
    while (d <= monthEnd) { if (isWorkingDay(d)) workingDays++; d.setDate(d.getDate() + 1); } }

  let usedDays = 0;
  let totalCapDays = 0;

  for (const c of consultants) {
    totalCapDays += (c.maxDays / 5) * workingDays;

    for (const p of projects) {
      if (p.status === "archived") continue;
      const allocs = (p.allocations ?? []).filter((a) => a.consultantId === c.id);
      if (!allocs.length) continue;

      const pStart   = new Date(p.startDate);
      const pEnd     = new Date(p.endDate);
      const effStart = new Date(Math.max(pStart.getTime(), monthStart.getTime()));
      const effEnd   = new Date(Math.min(pEnd.getTime(),   monthEnd.getTime()));
      if (effStart > effEnd) continue;

      for (const alloc of allocs) {
        const iter = new Date(effStart);
        while (iter <= effEnd) {
          if (iter.getDay() === alloc.weekday && isWorkingDay(iter)) {
            const week = getISOWeek(iter);
            if (p.cadence === "weekly" ||
                (p.cadence === "biweekly_odd"  && week % 2 === 1) ||
                (p.cadence === "biweekly_even" && week % 2 === 0)) {
              usedDays++;
            }
          }
          iter.setDate(iter.getDate() + 1);
        }
      }
    }
  }

  const freeDays = Math.max(0, totalCapDays - usedDays);
  const pct = totalCapDays > 0 ? Math.round(usedDays / totalCapDays * 100) : 0;
  return { used: usedDays, total: Math.round(totalCapDays), free: Math.round(freeDays), pct };
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(consultants: Consultant[], projects: Project[], monthsAhead = 3) {
  const today = new Date(); today.setHours(0,0,0,0);
  const endDate = new Date(today.getFullYear(), today.getMonth() + monthsAhead, 0);

  const rows: string[] = ["Consultor,Projeto,Cliente,Data,Dia da Semana,Papel"];

  for (const c of consultants) {
    for (const p of projects) {
      if (p.status === "archived") continue;
      const allocs = (p.allocations ?? []).filter((a) => a.consultantId === c.id);
      if (!allocs.length) continue;

      const pStart = new Date(p.startDate);
      const pEnd   = new Date(p.endDate);
      const effStart = new Date(Math.max(pStart.getTime(), today.getTime()));
      const effEnd   = new Date(Math.min(pEnd.getTime(), endDate.getTime()));
      if (effStart > effEnd) continue;

      for (const alloc of allocs) {
        const iter = new Date(effStart);
        while (iter <= effEnd) {
          if (iter.getDay() === alloc.weekday && isWorkingDay(iter)) {
            const week = getISOWeek(iter);
            const active =
              p.cadence === "weekly" ||
              (p.cadence === "biweekly_odd"  && week % 2 === 1) ||
              (p.cadence === "biweekly_even" && week % 2 === 0);
            if (active) {
              const dateStr = iter.toISOString().slice(0, 10);
              const dayName = WEEKDAY_NAMES[iter.getDay()];
              const role    = alloc.role === "lider" ? "Líder" : "Consultor";
              rows.push([
                `"${c.name}"`, `"${p.acronym}"`, `"${p.client}"`,
                dateStr, dayName, role,
              ].join(","));
            }
          }
          iter.setDate(iter.getDate() + 1);
        }
      }
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `alocacoes_${today.toISOString().slice(0, 7)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const { consultants, projects } = useAppStore();

  const [occMonth, setOccMonth] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });

  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [showOccFilter, setShowOccFilter] = useState(false);

  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const ganttDragRef   = useRef<{ x: number; scrollLeft: number } | null>(null);
  const [ganttDragging, setGanttDragging] = useState(false);

  function onGanttMouseDown(e: React.MouseEvent) {
    const el = ganttScrollRef.current;
    if (!el) return;
    ganttDragRef.current = { x: e.clientX, scrollLeft: el.scrollLeft };
    setGanttDragging(true);
  }

  function onGanttMouseMove(e: React.MouseEvent) {
    if (!ganttDragRef.current || !ganttScrollRef.current) return;
    e.preventDefault();
    ganttScrollRef.current.scrollLeft = ganttDragRef.current.scrollLeft - (e.clientX - ganttDragRef.current.x);
  }

  function onGanttDragEnd() {
    ganttDragRef.current = null;
    setGanttDragging(false);
  }

  function toggleConsultant(id: number) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const consultantMap = useMemo(
    () => new Map(consultants.map((c) => [c.id, c])),
    [consultants],
  );

  const confirmed = projects.filter((p) => p.status === "confirmed");
  const hot       = projects.filter((p) => p.status === "hot");

  const { conflicts, conflictGroups } = useMemo(() => {
    const conflicts = detectConflicts(projects);
    const groups = [
      {
        label: "Entre Confirmados",
        description: "projetos já confirmados compartilham consultores no mesmo dia",
        headerColor: "#c0392b", rowBg: "#fdf1f0", rowBorder: "#f5b7b1",
        items: conflicts.filter((c) => c.a.status === "confirmed" && c.b.status === "confirmed"),
      },
      {
        label: "Confirmados × Prospectos",
        description: "projeto confirmado e prospecto disputam os mesmos consultores",
        headerColor: "#d35400", rowBg: "#fef5e7", rowBorder: "#f9e4b7",
        items: conflicts.filter(
          (c) =>
            (c.a.status === "confirmed" && c.b.status !== "confirmed") ||
            (c.b.status === "confirmed" && c.a.status !== "confirmed"),
        ),
      },
      {
        label: "Entre Prospectos",
        description: "dois prospectos disputam os mesmos consultores",
        headerColor: "#7d6608", rowBg: "#fefdf0", rowBorder: "#f5eea0",
        items: conflicts.filter((c) => c.a.status !== "confirmed" && c.b.status !== "confirmed"),
      },
    ].filter((g) => g.items.length > 0);
    return { conflicts, conflictGroups: groups };
  }, [projects]);

  const { totalRemaining, availableCount, fullCount } = useMemo(() => {
    const by = consultants.map((c) => remainingCapacity(c, projects));
    return {
      totalRemaining: by.reduce((s, v) => s + Math.max(0, v), 0),
      availableCount: by.filter((v) => v > 0).length,
      fullCount:      by.filter((v) => v <= 0).length,
    };
  }, [consultants, projects]);

  const occConsultants = useMemo(
    () => consultants.filter((c) => !excludedIds.has(c.id)),
    [consultants, excludedIds],
  );

  const monthlyOcc = useMemo(
    () => computeMonthlyOccupancy(occConsultants, projects, occMonth),
    [occConsultants, projects, occMonth],
  );

  function prevMonth() { setOccMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
  function nextMonth() { setOccMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }

  const projection = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }, (_, i) => {
      const month = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const occ   = computeMonthlyOccupancy(consultants, projects, month);
      return {
        label: `${MONTH_ABBR[month.getMonth()]}/${String(month.getFullYear()).slice(2)}`,
        free:  occ.free,
        total: occ.total,
        pct:   occ.pct,
      };
    });
  }, [consultants, projects]);

  const { activeProjects, ganttStart, ganttDays, ganttMonths } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const active = projects
      .filter((p) => p.status !== "archived" && p.startDate && p.endDate && new Date(p.endDate) >= today)
      .sort((a, b) => {
        const sd = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
        return sd !== 0 ? sd : a.acronym.localeCompare(b.acronym);
      });

    const ganttStart = (() => {
      if (!active.length) { const d = new Date(); d.setDate(1); return d; }
      const earliest = new Date(Math.min(...active.map((p) => new Date(p.startDate).getTime())));
      earliest.setDate(1);
      return earliest;
    })();

    const ganttEnd = (() => {
      if (!active.length) { const d = new Date(); d.setMonth(d.getMonth() + 6); d.setDate(0); return d; }
      const latest = new Date(Math.max(...active.map((p) => new Date(p.endDate).getTime())));
      latest.setMonth(latest.getMonth() + 1); latest.setDate(0);
      return latest;
    })();

    const ganttDays = Math.max(1, (ganttEnd.getTime() - ganttStart.getTime()) / 86400000);

    const ganttMonths: string[] = [];
    const cursor = new Date(ganttStart);
    while (cursor <= ganttEnd) {
      ganttMonths.push(`${MONTH_ABBR[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { activeProjects: active, ganttStart, ganttEnd, ganttDays, ganttMonths };
  }, [projects]);

  function barStyle(project: { startDate: string; endDate: string; status: string }) {
    const s = new Date(project.startDate);
    const e = new Date(project.endDate);
    const left  = Math.max(0, (s.getTime() - ganttStart.getTime()) / 86400000 / ganttDays) * 100;
    const width = Math.min(100 - left, (e.getTime() - s.getTime()) / 86400000 / ganttDays * 100);
    return {
      left: `${left}%`, width: `${Math.max(width, 1)}%`,
      background: GANTT_COLORS[project.status] ?? "#95a5a6",
      opacity: project.status === "cold" ? 0.6 : 1,
    };
  }

  return (
    <div className="page-content">
      {/* Page header with export */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => exportCSV(consultants, projects)}
        >
          ⬇ Exportar CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {/* Consultores */}
        <div className="stat-card">
          <div className="stat-label">Consultores</div>
          <div className="stat-value">{consultants.length}</div>
          <div className="stat-sub">{consultants.filter(c => c.isLeader).length} líderes</div>
        </div>

        {/* Projetos Ativos */}
        <div className="stat-card">
          <div className="stat-label">Projetos Ativos</div>
          <div className="stat-value">{confirmed.length}</div>
          <div className="stat-sub">{hot.length} prospectos quentes</div>
        </div>

        {/* Ocupação — mensal com navegação */}
        <div className="stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div className="stat-label" style={{ margin: 0 }}>Ocupação</div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={prevMonth} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: "0 3px", lineHeight: 1 }}>‹</button>
              <span style={{ fontSize: 10, color: "var(--muted)", minWidth: 46, textAlign: "center", fontWeight: 600 }}>
                {MONTH_ABBR[occMonth.getMonth()]}/{String(occMonth.getFullYear()).slice(2)}
              </span>
              <button onClick={nextMonth} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: "0 3px", lineHeight: 1 }}>›</button>
            </div>
          </div>
          <div className="stat-value">{monthlyOcc.pct}%</div>
          <div className="stat-sub">{monthlyOcc.used} de {monthlyOcc.total} dias úteis no mês</div>
          <button
            onClick={() => setShowOccFilter((v) => !v)}
            style={{
              marginTop: 6, fontSize: 10, color: "var(--muted)", background: "none",
              border: "none", cursor: "pointer", padding: 0, display: "flex",
              alignItems: "center", gap: 3,
            }}
          >
            <span style={{ fontSize: 11 }}>⚙</span>
            {showOccFilter ? "fechar" : "filtrar consultores"}
            {!showOccFilter && excludedIds.size > 0 && (
              <span style={{
                background: "var(--red)", color: "#fff", borderRadius: 8,
                padding: "1px 5px", fontSize: 9, fontWeight: 700,
              }}>
                {excludedIds.size}
              </span>
            )}
          </button>
          {showOccFilter && (
            <div style={{
              marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 6,
              maxHeight: 160, overflowY: "auto",
            }}>
              {consultants.map((c) => {
                const excluded = excludedIds.has(c.id);
                return (
                  <label key={c.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 11, cursor: "pointer", padding: "2px 0",
                    color: excluded ? "var(--muted)" : "var(--text)",
                    textDecoration: excluded ? "line-through" : "none",
                  }}>
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => toggleConsultant(c.id)}
                      style={{ cursor: "pointer", accentColor: "var(--red)" }}
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Capacidade Restante */}
        <div className="stat-card">
          <div className="stat-label">Capacidade Restante</div>
          <div className="stat-value">{totalRemaining.toFixed(1)}<span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)", marginLeft: 3 }}>d/sem</span></div>
          <div className="stat-sub">{availableCount} disponíveis · {fullCount} no limite</div>
        </div>
      </div>

      {/* Capacity projection chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>Projeção de Capacidade</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            capacidade total do time nos próximos 6 meses
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {projection.map((m, i) => {
            const freePct = m.total > 0 ? m.free / m.total : 0;
            const usedPct = 1 - freePct;
            const color = freePct >= 0.4 ? "#27ae60" : freePct >= 0.15 ? "#e67e22" : "#e74c3c";
            const isNow = i === 0;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, color, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {m.free}d livres
                </div>
                {/* Unified stacked bar: ocupado embaixo, livre em cima */}
                <div
                  style={{
                    width: "100%", height: CHART_H,
                    borderRadius: 4, overflow: "hidden",
                    display: "flex", flexDirection: "column",
                    border: `1.5px solid ${isNow ? color : "#e0e0e0"}`,
                    boxShadow: isNow ? `0 0 0 2px ${color}28` : undefined,
                  }}
                  title={`${m.label}: ${m.free}d livres de ${m.total}d (${Math.round(usedPct * 100)}% ocupado)`}
                >
                  <div style={{ flexGrow: Math.max(freePct, 0.02), background: `${color}18` }} />
                  <div style={{ flexGrow: Math.max(usedPct, 0.02), background: color, opacity: isNow ? 0.85 : 0.65 }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: isNow ? 700 : 400, color: isNow ? "var(--text)" : "var(--muted)" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>
                    {Math.round(usedPct * 100)}% ocup.
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)",
          fontSize: 10, color: "var(--muted)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, background: "#27ae6018", border: "1px solid #27ae60", borderRadius: 2, display: "inline-block" }} />
            Dias livres
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, background: "#aaa", borderRadius: 2, display: "inline-block", opacity: 0.7 }} />
            Dias ocupados
          </span>
          <span style={{ marginLeft: "auto" }}>
            Cor: <span style={{ color: "#27ae60", fontWeight: 600 }}>verde</span> &gt;40% livre ·{" "}
            <span style={{ color: "#e67e22", fontWeight: 600 }}>laranja</span> 15–40% ·{" "}
            <span style={{ color: "#e74c3c", fontWeight: 600 }}>vermelho</span> &lt;15%
          </span>
        </div>
      </div>

      {/* Conflict section */}
      {conflicts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0, color: "var(--red)" }}>
              Conflitos Detectados
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: "#fdf1f0", color: "var(--red)", border: "1px solid #f5b7b1",
            }}>
              {conflicts.length}
            </span>
          </div>

          {conflictGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".06em", color: group.headerColor,
                marginBottom: 6, display: "flex", alignItems: "center", gap: 8,
              }}>
                {group.label}
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--muted)", fontSize: 11 }}>
                  — {group.description}
                </span>
              </div>

              {group.items.map((conflict, i) => {
                const sharedNames = conflict.sharedConsultants
                  .map((id) => consultantMap.get(id)?.name ?? `#${id}`)
                  .join(", ");
                const days = conflict.sharedDays.map((d) => DAY_NAMES[d]).join(", ");
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "9px 12px", borderRadius: 6, marginBottom: 6,
                    background: group.rowBg, border: `1px solid ${group.rowBorder}`,
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                      background: conflict.severity === "high" ? "#c0392b" : "#e67e22",
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", fontSize: 13 }}>
                          {conflict.a.acronym}
                        </span>
                        <StatusBadge status={conflict.a.status} />
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>×</span>
                        <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", fontSize: 13 }}>
                          {conflict.b.acronym}
                        </span>
                        <StatusBadge status={conflict.b.status} />
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 16 }}>
                        <span>{sharedNames}</span>
                        <span style={{ fontWeight: 600, color: "#555" }}>{days}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Gantt */}
      {(() => {
        const ROW_H    = 36;
        const HEADER_H = 30;
        const LABEL_W  = 170;
        const MONTH_W  = 90;
        const totalW   = Math.max(300, ganttMonths.length * MONTH_W);

        return (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 20px 12px" }}>
              <div className="card-title">Linha do Tempo</div>
            </div>

            <div style={{ display: "flex" }}>
              {/* ── Fixed label column ── */}
              <div style={{
                width: LABEL_W, flexShrink: 0,
                borderRight: "1px solid var(--border)",
                background: "var(--surface)",
                zIndex: 2,
              }}>
                {/* header spacer aligned with months row */}
                <div style={{ height: HEADER_H, borderBottom: "1px solid var(--border)" }} />
                {activeProjects.map((p) => (
                  <div key={p.id} style={{
                    height: ROW_H, display: "flex", alignItems: "center",
                    padding: "0 10px 0 20px",
                    borderBottom: "1px solid var(--border)",
                    overflow: "hidden",
                  }}>
                    <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", marginRight: 5, whiteSpace: "nowrap", fontSize: 13 }}>
                      {p.acronym}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.client}
                    </span>
                  </div>
                ))}
                <div style={{ height: 12 }} />
              </div>

              {/* ── Scrollable bars column ── */}
              <div
                ref={ganttScrollRef}
                style={{ flex: 1, overflowX: "auto", cursor: ganttDragging ? "grabbing" : "grab", userSelect: "none" }}
                onMouseDown={onGanttMouseDown}
                onMouseMove={onGanttMouseMove}
                onMouseUp={onGanttDragEnd}
                onMouseLeave={onGanttDragEnd}
              >
                {/* Months header */}
                <div style={{ display: "flex", width: totalW, height: HEADER_H, borderBottom: "1px solid var(--border)" }}>
                  {ganttMonths.map((m) => (
                    <div key={m} className="gantt-month" style={{ width: MONTH_W, flexShrink: 0, height: HEADER_H }}>
                      {m}
                    </div>
                  ))}
                </div>
                {/* Bars */}
                {activeProjects.map((p) => (
                  <div key={p.id} style={{
                    height: ROW_H, position: "relative",
                    width: totalW,
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <div className="gantt-bar" style={barStyle(p)}>{p.acronym}</div>
                  </div>
                ))}
                <div style={{ height: 12 }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
