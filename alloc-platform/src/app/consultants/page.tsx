"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { DAY_NAMES, getISOWeek, getProjectColor } from "@/lib/domain";
import { Avatar, LevelTag, ChipGroup } from "@/components/ui";
import { isWorkingDay } from "@/lib/holidays";
import type { Consultant, Project, Weekday, Absence } from "@/types";
import {LuCalendar, LuPencil} from "react-icons/lu";



const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function computeConsultantMonthly(
  consultantId: number,
  maxDays: number,
  projects: Project[],
  month: Date,
  absences: Absence[],
) {
  const y = month.getFullYear(), m = month.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd   = new Date(y, m + 1, 0);

  // Absence days in this month
  const myAbsences = absences.filter((a) => a.consultantId === consultantId);
  const absenceDatesInMonth = new Set<string>();
  for (const abs of myAbsences) {
    const s = new Date(abs.startDate + "T00:00:00");
    const e = new Date(abs.endDate   + "T00:00:00");
    const d = new Date(Math.max(s.getTime(), monthStart.getTime()));
    const end = new Date(Math.min(e.getTime(), monthEnd.getTime()));
    while (d <= end) {
      if (isWorkingDay(d)) absenceDatesInMonth.add(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }

  let workingDays = 0;
  { const d = new Date(monthStart);
    while (d <= monthEnd) {
      if (isWorkingDay(d) && !absenceDatesInMonth.has(d.toISOString().slice(0, 10))) workingDays++;
      d.setDate(d.getDate() + 1);
    }
  }

  const totalDays = (maxDays / 5) * workingDays;
  const byProject: { projectId: number; acronym: string; days: number }[] = [];

  for (const p of projects) {
    if (p.status === "archived") continue;
    const allocs = (p.allocations ?? []).filter((a) => a.consultantId === consultantId);
    if (!allocs.length) continue;

    const effStart = new Date(Math.max(new Date(p.startDate).getTime(), monthStart.getTime()));
    const effEnd   = new Date(Math.min(new Date(p.endDate).getTime(),   monthEnd.getTime()));
    if (effStart > effEnd) continue;

    let days = 0;
    for (const alloc of allocs) {
      const iter = new Date(effStart);
      while (iter <= effEnd) {
        const dateStr = iter.toISOString().slice(0, 10);
        if (iter.getDay() === alloc.weekday && isWorkingDay(iter) && !absenceDatesInMonth.has(dateStr)) {
          const week = getISOWeek(iter);
          if (
            p.cadence === "weekly" ||
            (p.cadence === "biweekly_odd"  && week % 2 === 1) ||
            (p.cadence === "biweekly_even" && week % 2 === 0)
          ) days++;
        }
        iter.setDate(iter.getDate() + 1);
      }
    }
    if (days > 0) byProject.push({ projectId: p.id, acronym: p.acronym, days });
  }

  const usedDays = byProject.reduce((s, b) => s + b.days, 0);
  const freeDays = Math.max(0, totalDays - usedDays);
  const pct      = totalDays > 0 ? usedDays / totalDays : 0;
  const absenceDays = absenceDatesInMonth.size;
  return { usedDays, totalDays, freeDays, byProject, pct, workingDays, absenceDays };
}

// ── Timeline modal ────────────────────────────────────────────────────────────

function TimelineModal({
  consultant,
  projects,
  absences,
  onClose,
}: {
  consultant: Consultant;
  projects: Project[];
  absences: Absence[];
  onClose: () => void;
}) {
  const today = new Date();
  const timelineStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const timelineEnd   = new Date(today.getFullYear(), today.getMonth() + 5, 0);
  const totalMs = timelineEnd.getTime() - timelineStart.getTime();

  const myProjects = projects.filter(
    (p) => p.status !== "archived" && (p.allocatedConsultants ?? []).includes(consultant.id)
  );
  const myAbsences = absences.filter((a) => a.consultantId === consultant.id);


  function pct(date: Date) {
    return Math.max(0, Math.min(100, ((date.getTime() - timelineStart.getTime()) / totalMs) * 100));
  }

  // Month markers
  const months: { label: string; pct: number }[] = [];
  const mCursor = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
  while (mCursor <= timelineEnd) {
    months.push({ label: `${MONTH_ABBR[mCursor.getMonth()]}/${String(mCursor.getFullYear()).slice(2)}`, pct: pct(mCursor) });
    mCursor.setMonth(mCursor.getMonth() + 1);
  }

  const todayPct = pct(today);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 640, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Timeline — {consultant.name}</div>

        {/* Month ruler */}
        <div style={{ position: "relative", height: 18, marginBottom: 4, marginTop: 8 }}>
          {months.map((m, i) => (
            <span key={i} style={{
              position: "absolute", left: `${m.pct}%`,
              fontSize: 10, color: "var(--muted)", transform: "translateX(-50%)",
            }}>{m.label}</span>
          ))}
          {/* Today line */}
          <div style={{
            position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0,
            width: 1, background: "#e74c3c",
          }} />
        </div>

        {/* Track area */}
        <div style={{ position: "relative", background: "#f5f5f5", borderRadius: 6, padding: "10px 0", minHeight: 60 }}>
          {/* Today line in tracks */}
          <div style={{
            position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0,
            width: 1, background: "rgba(231,76,60,0.35)", zIndex: 1,
          }} />

          {/* Project bars */}
          {myProjects.map((p, i) => {
            const s = new Date(p.startDate);
            const e = new Date(p.endDate);
            const left  = pct(s > timelineStart ? s : timelineStart);
            const right = pct(e < timelineEnd   ? e : timelineEnd);
            const width = Math.max(right - left, 0.5);
            const color = getProjectColor(p.id, projects);
            return (
              <div key={p.id} style={{ position: "relative", height: 24, marginBottom: 4 }}>
                <div style={{
                  position: "absolute", left: `${left}%`, width: `${width}%`,
                  height: "100%", background: color.bg,
                  border: `1.5px solid ${color.border}`, borderRadius: 4,
                  display: "flex", alignItems: "center", paddingLeft: 6,
                  fontSize: 11, color: color.text, fontWeight: 600,
                  overflow: "hidden", whiteSpace: "nowrap",
                }} title={`${p.client} (${p.startDate} – ${p.endDate})`}>
                  {p.acronym}
                </div>
              </div>
            );
          })}

          {/* Absence bars */}
          {myAbsences.map((abs) => {
            const s = new Date(abs.startDate + "T00:00:00");
            const e = new Date(abs.endDate   + "T00:00:00");
            const left  = pct(s > timelineStart ? s : timelineStart);
            const right = pct(e < timelineEnd   ? e : timelineEnd);
            const width = Math.max(right - left, 0.5);
            return (
              <div key={abs.id} style={{ position: "relative", height: 18, marginBottom: 2 }}>
                <div style={{
                  position: "absolute", left: `${left}%`, width: `${width}%`,
                  height: "100%", background: "rgba(231,76,60,0.15)",
                  border: "1px dashed #e74c3c", borderRadius: 3,
                  display: "flex", alignItems: "center", paddingLeft: 5,
                  fontSize: 10, color: "#c0392b", overflow: "hidden", whiteSpace: "nowrap",
                }} title={`Ausência: ${abs.startDate} – ${abs.endDate}${abs.reason ? ` (${abs.reason})` : ""}`}>
                  {abs.reason ?? "Ausência"}
                </div>
              </div>
            );
          })}

          {myProjects.length === 0 && myAbsences.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: "16px 0" }}>
              Sem projetos ou ausências neste período
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 3, background: "#e74c3c", display: "inline-block" }} /> Hoje
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 8, background: "rgba(231,76,60,0.15)", border: "1px dashed #e74c3c", display: "inline-block", borderRadius: 2 }} /> Ausência
          </span>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Types & constants ─────────────────────────────────────────────────────────

type FormState = Omit<Consultant, "id"> & { notes: string };

const EMPTY_FORM: FormState = {
  name: "", level: "junior", isLeader: false, maxDays: 5, restrictions: [], notes: "",
};

const LEVEL_OPTIONS = [
  { value: "junior", label: "Júnior" },
  { value: "pleno",  label: "Pleno"  },
  { value: "senior", label: "Sênior" },
];

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5].map((d) => ({
  value: d,
  label: DAY_NAMES[d],
}));

// ── Absence form ──────────────────────────────────────────────────────────────

function AbsenceSection({
  consultantId,
  absences,
  addAbsence,
  removeAbsence,
}: {
  consultantId: number | null;
  absences: Absence[];
  addAbsence: (d: Omit<Absence, "id">) => Promise<void>;
  removeAbsence: (id: number) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);

  const myAbsences = absences
    .filter((a) => a.consultantId === consultantId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  async function handleAdd() {
    if (!newStart || !newEnd || !consultantId) return;
    setSaving(true);
    try {
      await addAbsence({ consultantId, startDate: newStart, endDate: newEnd, reason: newReason || null });
      setShowAdd(false);
      setNewStart(""); setNewEnd(""); setNewReason("");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span className="form-label" style={{ margin: 0 }}>Ausências / Férias</span>
        {consultantId && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancelar" : "+ Adicionar"}
          </button>
        )}
      </div>

      {showAdd && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <input type="date" className="form-input" style={{ width: 130 }} value={newStart}
            onChange={(e) => setNewStart(e.target.value)} placeholder="Início" />
          <input type="date" className="form-input" style={{ width: 130 }} value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)} placeholder="Fim" />
          <input className="form-input" style={{ flex: 1, minWidth: 100 }} value={newReason}
            onChange={(e) => setNewReason(e.target.value)} placeholder="Motivo (opcional)" />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !newStart || !newEnd}>
            {saving ? "..." : "Salvar"}
          </button>
        </div>
      )}

      {myAbsences.length === 0 && !showAdd && (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>Nenhuma ausência cadastrada</div>
      )}
      {myAbsences.map((abs) => (
        <div key={abs.id} style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 12,
          padding: "4px 0", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ flex: 1 }}>
            <strong>{abs.startDate}</strong> → <strong>{abs.endDate}</strong>
            {abs.reason && <span style={{ color: "var(--muted)", marginLeft: 6 }}>{abs.reason}</span>}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ color: "#c0392b", fontSize: 11 }}
            onClick={() => { if (confirm("Remover ausência?")) removeAbsence(abs.id); }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConsultantsPage() {
  const {
    consultants, projects, absences,
    addConsultant, updateConsultant, removeConsultant,
    addAbsence, removeAbsence,
  } = useAppStore();

  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [timelineFor, setTimelineFor] = useState<Consultant | null>(null);
  const [occMonth, setOccMonth]     = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(c: Consultant) {
    setEditingId(c.id);
    setForm({ name: c.name, level: c.level, isLeader: c.isLeader, maxDays: c.maxDays, restrictions: c.restrictions, notes: c.notes ?? "" });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  function toggleRestriction(value: string | number) {
    const d = Number(value) as Weekday;
    setForm((f) => {
      const restrictions = f.restrictions.includes(d)
        ? f.restrictions.filter((x) => x !== d)
        : [...f.restrictions, d];
      const available = 5 - restrictions.length;
      return { ...f, restrictions, maxDays: Math.min(f.maxDays, Math.max(1, available)) };
    });
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const data = { ...form, maxDays: Number(form.maxDays), notes: form.notes || null };
      if (editingId !== null) {
        await updateConsultant(editingId, data);
      } else {
        await addConsultant(data);
      }
      closeModal();
    } catch (err: any) {
      setSaveError(err?.message ?? "Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const consultantMonthly = useMemo(
    () => new Map(
      consultants.map((c) => [c.id, computeConsultantMonthly(c.id, c.maxDays, projects, occMonth, absences)])
    ),
    [consultants, projects, occMonth, absences],
  );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Consultores</div>
          <div className="topbar-sub">{consultants.length} cadastrados</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Novo Consultor</button>
      </div>

      <div className="page-content">
        <div className="card">
          {consultants.length === 0 && (
            <div className="empty-state">Nenhum consultor cadastrado. Clique em "+ Novo Consultor" para começar.</div>
          )}

          {/* Month navigator */}
          {consultants.length > 0 && (
            <div style={{
              display: "flex", justifyContent: "flex-end", alignItems: "center",
              gap: 4, paddingBottom: 10, marginBottom: 4, borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 4 }}>Ocupação mensal</span>
              <button onClick={() => setOccMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: "0 3px", lineHeight: 1 }}>‹</button>
              <span style={{ fontSize: 11, fontWeight: 700, minWidth: 46, textAlign: "center" }}>
                {MONTH_ABBR[occMonth.getMonth()]}/{String(occMonth.getFullYear()).slice(2)}
              </span>
              <button onClick={() => setOccMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: "0 3px", lineHeight: 1 }}>›</button>
            </div>
          )}

          {consultants.map((c, i) => {
            const cProjects = projects.filter(
              (p) => p.status !== "archived" && (p.allocatedConsultants ?? []).includes(c.id)
            );
            const monthly  = consultantMonthly.get(c.id)!;
            const dotColor = monthly.pct >= 0.85 ? "#e74c3c" : monthly.pct >= 0.6 ? "#e67e22" : "#27ae60";
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 0", borderBottom: "1px solid var(--border)",
              }}>
                <Avatar name={c.name} index={i} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {c.restrictions.length > 0 && (
                      <span>Restrição: {c.restrictions.map((d) => DAY_NAMES[d]).join(", ")} · </span>
                    )}
                    {cProjects.length > 0
                      ? <strong style={{ marginRight: 4 }}>{cProjects.map((p: Project) => p.acronym).join(", ")}</strong>
                      : "Sem alocação"}
                    {monthly.absenceDays > 0 && (
                      <span style={{ color: "#c0392b", marginLeft: 4 }}>· {monthly.absenceDays}d ausente</span>
                    )}
                  </div>
                </div>
                <LevelTag level={c.level} isLeader={c.isLeader} />

                {/* Segmented capacity bar */}
                <div style={{ width: 176, flexShrink: 0 }}>
                  <div style={{
                    height: 7, borderRadius: 4, background: "#e8e8e8",
                    overflow: "hidden", display: "flex",
                  }}>
                    {monthly.byProject.map((seg) => (
                      <div key={seg.projectId}
                        title={`${seg.acronym}: ${seg.days}d`}
                        style={{
                          width: `${monthly.totalDays > 0 ? (seg.days / monthly.totalDays) * 100 : 0}%`,
                          background: getProjectColor(seg.projectId, projects).border,
                          flexShrink: 0, minWidth: 2,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 10, marginTop: 4, color: "var(--muted)",
                  }}>
                    <span style={{ color: dotColor, fontWeight: 700 }}>{Math.round(monthly.freeDays)}d livres</span>
                    <span>{Math.round(monthly.usedDays)}/{Math.round(monthly.totalDays)}d úteis</span>
                  </div>
                </div>

                <button className="btn btn-ghost btn-sm" onClick={() => setTimelineFor(c)} title="Ver timeline"><LuCalendar /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} title="Editar consultor"><LuPencil /></button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { if (confirm(`Remover ${c.name}? Esta ação não pode ser desfeita.`)) removeConsultant(c.id); }}
                  title="Remover consultor">✕</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline modal */}
      {timelineFor && (
        <TimelineModal
          consultant={timelineFor}
          projects={projects}
          absences={absences}
          onClose={() => setTimelineFor(null)}
        />
      )}

      {/* Edit / New modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editingId !== null ? "Editar Consultor" : "Novo Consultor"}</div>
            <div className="form-grid">
              <div className="form-group full">
                <label className="form-label">Nome</label>
                <input className="form-input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome completo" />
              </div>
              <div className="form-group">
                <label className="form-label">Nível</label>
                <select className="form-select" value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as any }))}>
                  {LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Máx. dias/semana</label>
                <input className="form-input" type="number" min={1}
                  max={5 - form.restrictions.length} value={form.maxDays}
                  onChange={(e) => {
                    const available = 5 - form.restrictions.length;
                    setForm((f) => ({ ...f, maxDays: Math.min(Math.max(1, Number(e.target.value)), available) }));
                  }} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  {5 - form.restrictions.length} dia{5 - form.restrictions.length !== 1 ? "s" : ""} disponível{5 - form.restrictions.length !== 1 ? "is" : ""} (máximo permitido)
                </div>
              </div>
              <div className="form-group full">
                <label className="form-label">É Líder?</label>
                <ChipGroup
                  options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]}
                  selected={[form.isLeader ? "sim" : "nao"]}
                  onToggle={(v) => setForm((f) => ({ ...f, isLeader: v === "sim" }))}
                  single
                />
              </div>
              <div className="form-group full">
                <label className="form-label">Restrições de dias</label>
                <ChipGroup options={WEEKDAY_OPTIONS} selected={form.restrictions} onToggle={toggleRestriction} />
              </div>
              <div className="form-group full">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Observações sobre o consultor..."
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Absences — only visible when editing */}
              {editingId !== null && (
                <div className="form-group full">
                  <AbsenceSection
                    consultantId={editingId}
                    absences={absences}
                    addAbsence={addAbsence}
                    removeAbsence={removeAbsence}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              {saveError && (
                <span style={{ fontSize: 12, color: "#c0392b", flex: 1 }}>{saveError}</span>
              )}
              <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Salvando..." : editingId !== null ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
