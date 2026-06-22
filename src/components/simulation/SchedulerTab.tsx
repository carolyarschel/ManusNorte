"use client";

import { useState, useCallback } from "react";
import { useAppStore, ScheduleEntry, ProposedAllocation } from "@/store/useAppStore";
import { CADENCE_LABELS, DAY_NAMES, LEVEL_LABELS } from "@/lib/domain";
import { StatusBadge, Avatar } from "@/components/ui";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function PriorityBadge({ rank }: { rank: number }) {
  const colors = [
    { bg: "#c0392b", text: "#fff" },
    { bg: "#e67e22", text: "#fff" },
    { bg: "#f1c40f", text: "#7d6608" },
  ];
  const c = colors[rank - 1] ?? { bg: "#bdc3c7", text: "#2c3e50" };
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: c.bg, color: c.text, fontWeight: 800, fontSize: 13,
      flexShrink: 0,
    }}>
      {rank}
    </div>
  );
}

function ScoreBar({ status, scarcity }: { status: number; scarcity: number }) {
  const total = status + scarcity;
  const statusPct = total > 0 ? (status / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, overflow: "hidden", background: "#e9ecef", display: "flex" }}>
        <div style={{ width: `${statusPct}%`, background: "#e67e22", transition: "width .3s" }} />
        <div style={{ flex: 1, background: "#2980b9" }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
        <span style={{ color: "#e67e22" }}>● status</span>{" "}
        <span style={{ color: "#2980b9" }}>● escassez</span>
      </div>
    </div>
  );
}

// ─── Result card for one scheduled project ────────────────────────────────────

function ScheduleCard({
  entry,
  projectName,
  projectStatus,
  projectCadence,
  consultants,
}: {
  entry: ScheduleEntry;
  projectName: string;
  projectAcronym: string;
  projectStatus: string;
  projectCadence: string;
  consultants: { id: number; name: string; level: string; isLeader: boolean }[];
}) {
  const [expanded, setExpanded] = useState(false);

  const delayed = entry.weeksDelayed > 0;
  const impossible = !entry.canBeScheduled;

  const borderColor = impossible ? "#e74c3c" : delayed ? "#e67e22" : "#27ae60";
  const bgColor     = impossible ? "#fff5f5" : delayed ? "#fffbf0" : "#f0fff4";

  // Group proposed allocations by consultant
  const grouped = new Map<number, ProposedAllocation[]>();
  for (const a of entry.proposed) {
    if (!grouped.has(a.consultantId)) grouped.set(a.consultantId, []);
    grouped.get(a.consultantId)!.push(a);
  }

  return (
    <div style={{
      border: `1.5px solid ${borderColor}`,
      borderRadius: 10,
      background: bgColor,
      marginBottom: 12,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <PriorityBadge rank={entry.priority} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", fontSize: 15 }}>
              {projectName}
            </span>
            <StatusBadge status={projectStatus as any} />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Score: {entry.score.toFixed(1)}
            </span>
          </div>
          <ScoreBar status={entry.scoreBreakdown.status} scarcity={entry.scoreBreakdown.scarcity} />
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 18, color: "var(--muted)", padding: "0 4px",
          }}
          aria-label={expanded ? "Recolher" : "Expandir"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Date suggestion */}
      <div style={{ padding: "0 14px 12px", display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
            Data original
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(entry.originalStartDate)}</div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
            Data sugerida
          </div>
          {impossible ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e74c3c" }}>Sem data viável (26sem)</div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: delayed ? "#e67e22" : "#27ae60" }}>
              {formatDate(entry.suggestedStartDate)}
              {delayed && (
                <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 400 }}>
                  (+{entry.weeksDelayed} sem)
                </span>
              )}
              {!delayed && (
                <span style={{ fontSize: 11, marginLeft: 6, color: "#27ae60" }}>✓ na data prevista</span>
              )}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
            Cadência
          </div>
          <div style={{ fontSize: 13 }}>{CADENCE_LABELS[projectCadence as keyof typeof CADENCE_LABELS] ?? projectCadence}</div>
        </div>
      </div>

      {/* Scarcity reason */}
      <div style={{ padding: "0 14px 10px" }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          🔎 Pool disponível: {entry.scarcityReason}
        </span>
      </div>

      {/* Expanded: issues + team */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", background: "#fff" }}>

          {/* Issues */}
          {entry.issues.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {entry.issues.map((iss, i) => (
                <div key={i} style={{ fontSize: 12, color: "#c0392b", marginBottom: 2 }}>
                  ⚠ {iss}
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {entry.suggestions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {entry.suggestions.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: "#1e8449", marginBottom: 2 }}>
                  ✓ {s}
                </div>
              ))}
            </div>
          )}

          {/* Proposed team */}
          {grouped.size > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                Time proposto
              </div>
              {Array.from(grouped.entries()).map(([cId, allocs]) => {
                const ci = consultants.findIndex((c) => c.id === cId);
                return (
                  <div key={cId} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 0", borderBottom: "1px solid var(--border)",
                  }}>
                    <Avatar name={allocs[0].consultantName} index={ci >= 0 ? ci : 0} size={26} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{allocs[0].consultantName}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{allocs[0].slotDescription}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#2e86c1" }}>
                        {allocs.map((a) => DAY_NAMES[a.weekday]).join(", ")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {allocs.length}x/sem · {allocs[0].role}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {grouped.size === 0 && !entry.issues.length && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Sem alocações propostas.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

export function SchedulerTab() {
  const { projects, consultants, scheduleProjects } = useAppStore();

  // Only hot/cold projects are schedulable
  const schedulable = projects.filter((p) => p.status === "hot" || p.status === "cold");

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [results, setResults] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  function toggle(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function selectAll() {
    setSelectedIds(schedulable.map((p) => p.id));
  }

  function clearAll() {
    setSelectedIds([]);
  }

  const runScheduler = useCallback(async () => {
    if (!selectedIds.length) return;
    setLoading(true);
    setError(null);
    setHasRun(false);
    try {
      const res = await scheduleProjects(selectedIds);
      setResults(res);
      setHasRun(true);
    } catch (err: any) {
      setError(err.message ?? "Erro ao calcular agenda");
    } finally {
      setLoading(false);
    }
  }, [selectedIds, scheduleProjects]);

  const consultantList = consultants.map((c) => ({
    id: c.id, name: c.name, level: c.level, isLeader: c.isLeader,
  }));

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>

      {/* ── Left: project selection ───────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            Projetos agendáveis ({schedulable.length})
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={selectAll}>Todos</button>
            <button className="btn btn-secondary btn-sm" onClick={clearAll}>Limpar</button>
          </div>
        </div>

        {schedulable.length === 0 && (
          <div className="card">
            <div className="empty-state">Sem projetos hot/cold para agendar.</div>
          </div>
        )}

        {schedulable.map((p) => {
          const isSelected = selectedIds.includes(p.id);
          return (
            <div
              key={p.id}
              onClick={() => toggle(p.id)}
              style={{
                padding: "11px 13px", borderRadius: 8, cursor: "pointer",
                marginBottom: 6,
                background: isSelected ? "#fff5f4" : "#fff",
                border: `1.5px solid ${isSelected ? "var(--red)" : "var(--border)"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox" checked={isSelected} onChange={() => {}}
                    style={{ accentColor: "var(--red)", width: 16, height: 16 }}
                  />
                  <div>
                    <span style={{ fontFamily: "var(--font-hd)", fontWeight: 800, color: "var(--red)", marginRight: 8, fontSize: 15 }}>
                      {p.acronym}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.client}</span>
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, paddingLeft: 24 }}>
                {p.startDate} → {p.endDate} · {CADENCE_LABELS[p.cadence as keyof typeof CADENCE_LABELS]}
              </div>
            </div>
          );
        })}

        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={runScheduler}
          disabled={!selectedIds.length || loading}
        >
          {loading
            ? `Calculando ${selectedIds.length} projeto(s)...`
            : `📅 Definir agenda (${selectedIds.length} selecionados)`}
        </button>

        {/* Legend */}
        <div style={{ marginTop: 16, padding: "10px 12px", background: "var(--surface)", borderRadius: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Como a prioridade é calculada:</div>
          <div>🟠 <strong>Status:</strong> hot (+20) &gt; cold (+10)</div>
          <div>🔵 <strong>Escassez:</strong> menos consultores elegíveis = maior prioridade</div>
          <div style={{ marginTop: 4 }}>Projetos são simulados na ordem de prioridade. Alocações do #1 viram restrição para o #2, e assim por diante.</div>
        </div>
      </div>

      {/* ── Right: results ────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Agenda sugerida
        </div>

        {error && (
          <div className="sim-result warn" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#c0392b" }}>❌ {error}</div>
          </div>
        )}

        {!hasRun && !loading && !error && (
          <div className="card">
            <div className="empty-state">
              Selecione projetos e clique em "Definir agenda" para calcular a ordem e datas ideais.
            </div>
          </div>
        )}

        {loading && (
          <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
            Analisando disponibilidade de consultores...
          </div>
        )}

        {hasRun && !loading && results.length === 0 && (
          <div className="card">
            <div className="empty-state">Nenhum projeto válido para agendar.</div>
          </div>
        )}

        {hasRun && !loading && results.map((entry) => {
          const p = projects.find((x) => x.id === entry.projectId);
          if (!p) return null;
          return (
            <ScheduleCard
              key={entry.projectId}
              entry={entry}
              projectName={`${p.acronym} — ${p.client}`}
              projectAcronym={p.acronym}
              projectStatus={p.status}
              projectCadence={p.cadence}
              consultants={consultantList}
            />
          );
        })}

        {/* Summary */}
        {hasRun && !loading && results.length > 0 && (
          <div style={{ marginTop: 8, padding: "10px 14px", background: "var(--surface)", borderRadius: 8, fontSize: 12, color: "var(--muted)" }}>
            {results.filter((r) => !r.weeksDelayed && r.canBeScheduled).length} na data prevista ·{" "}
            {results.filter((r) => r.weeksDelayed > 0 && r.canBeScheduled).length} com atraso ·{" "}
            {results.filter((r) => !r.canBeScheduled).length} sem data viável
          </div>
        )}
      </div>
    </div>
  );
}
