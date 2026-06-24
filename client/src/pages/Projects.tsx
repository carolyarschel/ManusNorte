import { useState, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { DAY_NAMES, CADENCE_LABELS, LEVEL_LABELS } from "@/lib/domain";
import { Avatar, StatusBadge, ChipGroup } from "@/components/ui/NorteUI";
import type { Project, Weekday, Cadence, ProjectStatus, LevelSlot, PinnedSlot, ConsultantLevel } from "@/types/index";

type FormLevelSlot = { id: string; level: ConsultantLevel; isLeader: boolean; daysPerWeek: number; visitDays: Weekday[] };
type FormPinnedSlot = { id: string; consultantId: number | null; daysPerWeek: number; visitDays: Weekday[]; cadence: string | null; _role?: string };
type FormState = { acronym: string; client: string; status: ProjectStatus; startDate: string; endDate: string; cadence: Cadence; notes: string; levelSlots: FormLevelSlot[]; pinnedSlots: FormPinnedSlot[] };
const EMPTY_FORM: FormState = { acronym: "", client: "", status: "cold", startDate: "", endDate: "", cadence: "weekly", notes: "", levelSlots: [], pinnedSlots: [] };
type FilterValue = ProjectStatus | "all" | "finalized";
const STATUS_FILTERS: [FilterValue, string][] = [["all","Todos"],["confirmed","Confirmados"],["hot","Quentes"],["cold","Frios"],["finalized","Finalizados"],["archived","Arquivados"]];
const LEVEL_OPTIONS: ConsultantLevel[] = ["junior","pleno","senior"];
function newLevelSlot(): FormLevelSlot { return { id: crypto.randomUUID(), level: "pleno", isLeader: false, daysPerWeek: 1, visitDays: [] }; }
function newPinnedSlot(): FormPinnedSlot { return { id: crypto.randomUUID(), consultantId: null, daysPerWeek: 1, visitDays: [], cadence: null }; }

function DaySelector({ selected, onChange, restricted = [], busy = [] }: { selected: Weekday[]; onChange: (d: Weekday[]) => void; restricted?: Weekday[]; busy?: Weekday[] }) {
  const hasInfo = restricted.length > 0 || busy.length > 0;
  return (
    <div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {([1, 2, 3, 4, 5] as Weekday[]).map((d) => {
          const isRestricted = restricted.includes(d);
          const isBusy       = busy.includes(d);
          const isSelected   = selected.includes(d);
          let chipStyle: React.CSSProperties = { padding: "3px 9px", fontSize: 11 };
          let extraClass = "";
          if (isSelected && !isRestricted) { extraClass = "selected"; }
          else if (isRestricted) { chipStyle = { ...chipStyle, opacity: 0.4, textDecoration: "line-through", cursor: "default" }; }
          else if (isBusy) { chipStyle = { ...chipStyle, background: "#fef3cd", borderColor: "#e67e22", color: "#ca6f1e" }; }
          return (
            <div key={d} className={`chip ${extraClass}`} style={chipStyle}
              title={isRestricted ? "Dia restrito" : isBusy ? "Consultor já alocado" : undefined}
              onClick={() => { if (isRestricted) return; onChange(isSelected ? selected.filter((x) => x !== d) : [...selected, d]); }}>
              {DAY_NAMES[d]}{isBusy && !isRestricted ? " ●" : ""}
            </div>
          );
        })}
        {selected.length === 0 && !hasInfo && (<span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center", marginLeft: 4 }}>(simulação escolhe)</span>)}
      </div>
      {hasInfo && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, display: "flex", gap: 10 }}>
          {restricted.length > 0 && <span>riscado = dia restrito</span>}
          {busy.length > 0 && <span>● = ocupado em outro projeto</span>}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { consultants, projects, addProject, updateProject, removeProject, setAllocations } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const consultantMap = useMemo(() => new Map(consultants.map((c) => [c.id, c])), [consultants]);
  const consultantIndexMap = useMemo(() => new Map(consultants.map((c, i) => [c.id, i])), [consultants]);

  function openNew() { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); }
  function openEdit(p: Project) {
    setEditingId(p.id);
    const confirmedWithAllocs = p.status === "confirmed" && (p.allocations ?? []).length > 0;
    const pinnedSlots: FormPinnedSlot[] = confirmedWithAllocs
      ? (() => {
          const byConsultant = new Map<number, { weekdays: Weekday[]; role: string }>();
          for (const a of p.allocations!) {
            if (!byConsultant.has(a.consultantId)) byConsultant.set(a.consultantId, { weekdays: [], role: a.role });
            byConsultant.get(a.consultantId)!.weekdays.push(a.weekday as Weekday);
          }
          return Array.from(byConsultant.entries()).map(([cId, { weekdays, role }]) => ({
            id: crypto.randomUUID(), consultantId: cId, daysPerWeek: weekdays.length,
            visitDays: ([...weekdays].sort() as Weekday[]), cadence: null, _role: role,
          }));
        })()
      : (p.pinnedSlots ?? []).map((s) => ({ id: crypto.randomUUID(), consultantId: s.consultantId, daysPerWeek: s.daysPerWeek, visitDays: s.visitDays as Weekday[], cadence: s.cadence ?? null }));
    setForm({
      acronym: p.acronym, client: p.client, status: p.status,
      startDate: p.startDate, endDate: p.endDate, cadence: p.cadence, notes: p.notes ?? "",
      levelSlots: confirmedWithAllocs ? [] : (p.levelSlots ?? []).map((s) => ({ id: crypto.randomUUID(), level: s.level, isLeader: s.isLeader, daysPerWeek: s.daysPerWeek, visitDays: s.visitDays as Weekday[] })),
      pinnedSlots,
    });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditingId(null); setForm(EMPTY_FORM); setSaveError(null); }
  function addLevelSlot() { setForm((f) => ({ ...f, levelSlots: [...f.levelSlots, newLevelSlot()] })); }
  function updateLevelSlot(id: string, patch: Partial<FormLevelSlot>) { setForm((f) => ({ ...f, levelSlots: f.levelSlots.map((s) => (s.id === id ? { ...s, ...patch } : s)) })); }
  function removeLevelSlot(id: string) { setForm((f) => ({ ...f, levelSlots: f.levelSlots.filter((s) => s.id !== id) })); }
  function addPinnedSlot() { setForm((f) => ({ ...f, pinnedSlots: [...f.pinnedSlots, newPinnedSlot()] })); }
  function updatePinnedSlot(id: string, patch: Partial<FormPinnedSlot>) { setForm((f) => ({ ...f, pinnedSlots: f.pinnedSlots.map((s) => (s.id === id ? { ...s, ...patch } : s)) })); }
  function removePinnedSlot(id: string) { setForm((f) => ({ ...f, pinnedSlots: f.pinnedSlots.filter((s) => s.id !== id) })); }

  async function save() {
    if (!form.acronym.trim() || !form.client.trim()) return;
    const editingProject = editingId !== null ? projects.find((p) => p.id === editingId) : null;
    const confirmedWithAllocs = editingProject?.status === "confirmed" && (editingProject.allocations ?? []).length > 0;
    setSaving(true); setSaveError(null);
    try {
      if (editingId !== null && confirmedWithAllocs) {
        await updateProject(editingId, { acronym: form.acronym, client: form.client, status: form.status, startDate: form.startDate, endDate: form.endDate, cadence: form.cadence, notes: form.notes || null });
        if (form.status === "confirmed") {
          const newAllocations = form.pinnedSlots.filter((s) => s.consultantId !== null && s.visitDays.length > 0).flatMap((s) => s.visitDays.map((day) => ({ consultantId: s.consultantId!, weekday: day, role: s._role ?? "consultor" })));
          await setAllocations(editingId, newAllocations);
        }
      } else {
        const levelSlots = form.levelSlots.map((s) => ({ level: s.level, isLeader: s.isLeader, daysPerWeek: s.daysPerWeek, visitDays: s.visitDays as number[] }));
        const pinnedSlots = form.pinnedSlots.filter((s) => s.consultantId !== null).map((s) => ({ consultantId: s.consultantId!, daysPerWeek: s.daysPerWeek, visitDays: s.visitDays as number[], cadence: s.cadence }));
        const payload = { acronym: form.acronym, client: form.client, status: form.status, startDate: form.startDate, endDate: form.endDate, cadence: form.cadence, notes: form.notes || null, leaderConsultantId: null as null, levelSlots, pinnedSlots };
        if (editingId !== null) { await updateProject(editingId, payload); } else { await addProject(payload); }
      }
      closeModal();
    } catch (err: any) { setSaveError(err?.message ?? "Erro ao salvar. Tente novamente."); } finally { setSaving(false); }
  }

  const todayMs = new Date().setHours(0, 0, 0, 0);
  const isFinished = (p: { endDate: string }) => new Date(p.endDate).getTime() < todayMs;
  const filtered = (() => {
    if (filter === "all") return projects;
    if (filter === "finalized") return projects.filter((p) => p.status !== "archived" && isFinished(p));
    return projects.filter((p) => p.status === filter && !isFinished(p));
  })();

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Projetos</div>
        <button className="btn btn-primary" onClick={openNew}>+ Novo Projeto</button>
      </div>
      <div className="page-content">
        <div className="tabs">
          {STATUS_FILTERS.map(([v, l]) => (<button key={v} className={`tab-btn ${filter === v ? "active" : ""}`} onClick={() => setFilter(v)}>{l}</button>))}
        </div>
        <div className="grid-2">
          {filtered.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-hd)", fontSize: 20, fontWeight: 800, color: "var(--red)", letterSpacing: "0.01em" }}>{p.acronym}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>{p.client}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div style={{ marginBottom: 8 }}>
                {(p.levelSlots ?? []).map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", display: "inline-block", flexShrink: 0 }} />
                    {s.isLeader ? "Líder " : ""}{LEVEL_LABELS[s.level]} — {s.daysPerWeek}x/sem
                    {(s.visitDays ?? []).length > 0 && <span style={{ color: "#2e86c1" }}> ({(s.visitDays ?? []).map((d) => DAY_NAMES[d]).join(", ")})</span>}
                  </div>
                ))}
                {(p.pinnedSlots ?? []).map((s, i) => {
                  const c = consultantMap.get(s.consultantId);
                  return (
                    <div key={i} style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2980b9", display: "inline-block", flexShrink: 0 }} />
                      {c?.name ?? `#${s.consultantId}`} — {s.daysPerWeek}x/sem
                      {(s.visitDays ?? []).length > 0 && <span style={{ color: "#2e86c1" }}> ({(s.visitDays ?? []).map((d) => DAY_NAMES[d]).join(", ")})</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                <span className="cadence-chip">{CADENCE_LABELS[p.cadence]}</span>
                {(p.visitDays ?? []).length > 0
                  ? (p.visitDays ?? []).map((d) => <span key={d} className="day-chip">{DAY_NAMES[d]}</span>)
                  : <span style={{ fontSize: 11, color: "var(--muted)" }}>Dias a definir</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>{p.startDate} → {p.endDate}</div>
              {(p.allocatedConsultants ?? []).length > 0 && (() => {
                const leader = p.leaderConsultantId ? (consultantMap.get(p.leaderConsultantId) ?? null) : null;
                const others = (p.allocatedConsultants ?? []).filter((id) => id !== p.leaderConsultantId);
                const hasLeaderCandidates = (p.allocatedConsultants ?? []).some((id) => consultantMap.get(id)?.isLeader);
                return (
                  <div style={{ marginBottom: 10 }}>
                    {leader ? (
                      <div title={`${leader.name} — líder do projeto`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 7, marginBottom: 6, background: "#fff5f4", border: "1.5px solid var(--red)" }}>
                        <Avatar name={leader.name} index={consultantIndexMap.get(leader.id) ?? 0} size={24} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", lineHeight: 1.2 }}>★ {leader.name}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>Líder do projeto</div>
                        </div>
                      </div>
                    ) : hasLeaderCandidates ? (
                      <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic", marginBottom: 4 }}>Clique num consultor líder para designar</div>
                    ) : null}
                    {others.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                        {others.map((cId) => {
                          const c = consultantMap.get(cId);
                          if (!c) return null;
                          const canLead = c.isLeader;
                          return (
                            <div key={cId} title={c.name}>
                              <Avatar name={c.name} index={consultantIndexMap.get(cId) ?? 0} size={24} />
                            </div>
                          );
                        })}
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{others.length} consultor{others.length !== 1 ? "es" : ""}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: 7, marginTop: "auto", paddingTop: 10 }}>
                {p.status !== "confirmed" && p.status !== "archived" && (<button className="btn btn-primary btn-sm" onClick={() => updateProject(p.id, { status: "confirmed" })}>✓ Confirmar</button>)}
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✎ Editar</button>
                {p.status !== "archived" && (<button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Arquivar ${p.acronym}?`)) updateProject(p.id, { status: "archived" }); }}>Arquivar</button>)}
                <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Excluir ${p.acronym}? Esta ação não pode ser desfeita.`)) removeProject(p.id); }}>Excluir</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: "1/-1" }}>Nenhum projeto</div>}
        </div>
      </div>
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ width: 660 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editingId !== null ? "Editar Projeto" : "Novo Projeto"}</div>
            <div className="form-grid" style={{ marginBottom: 20 }}>
              <div className="form-group">
                <label className="form-label">Sigla</label>
                <input className="form-input" value={form.acronym} onChange={(e) => setForm((f) => ({ ...f, acronym: e.target.value.toUpperCase().slice(0, 5) }))} placeholder="Ex: TDG" />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}>
                  <option value="cold">Prospecto Frio</option>
                  <option value="hot">Prospecto Quente</option>
                  <option value="confirmed">Confirmado</option>
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">Empresa Cliente</label>
                <input className="form-input" value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Ex: Banco Alfa" />
              </div>
              <div className="form-group">
                <label className="form-label">Data de Início</label>
                <input className="form-input" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Data de Fim</label>
                <input className="form-input" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="form-group full">
                <label className="form-label">Cadência</label>
                <select className="form-select" value={form.cadence} onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value as Cadence }))}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly_odd">Quinzenal (semanas ímpares)</option>
                  <option value="biweekly_even">Quinzenal (semanas pares)</option>
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observações sobre o projeto..." style={{ resize: "vertical" }} />
              </div>
            </div>
            {(() => {
              const editingProject = editingId !== null ? projects.find((p) => p.id === editingId) : null;
              const confirmedWithAllocs = editingProject?.status === "confirmed" && (editingProject.allocations ?? []).length > 0;
              if (confirmedWithAllocs) return null;
              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Vagas por Nível</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Qualquer consultor que se encaixe no perfil</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={addLevelSlot}>+ Adicionar vaga</button>
                  </div>
                  {form.levelSlots.length === 0 && (<div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0" }}>Nenhuma vaga por nível adicionada.</div>)}
                  {form.levelSlots.map((slot) => (
                    <div key={slot.id} style={{ background: "var(--bg)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
                        <div className="form-group">
                          <label className="form-label">Nível</label>
                          <select className="form-select" value={slot.level} onChange={(e) => updateLevelSlot(slot.id, { level: e.target.value as ConsultantLevel })}>
                            {LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Dias/semana</label>
                          <input className="form-input" type="number" min={1} max={5} value={slot.daysPerWeek} onChange={(e) => updateLevelSlot(slot.id, { daysPerWeek: Number(e.target.value) })} />
                        </div>
                        <div className="form-group" style={{ alignSelf: "end" }}>
                          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" checked={slot.isLeader} onChange={(e) => updateLevelSlot(slot.id, { isLeader: e.target.checked })} style={{ accentColor: "var(--red)" }} />
                            Líder
                          </label>
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "end" }} onClick={() => removeLevelSlot(slot.id)}>✕</button>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Dias preferidos <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
                        <DaySelector selected={slot.visitDays} onChange={(days) => updateLevelSlot(slot.id, { visitDays: days, daysPerWeek: days.length || slot.daysPerWeek })} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {(() => {
              const editingProject = editingId !== null ? projects.find((p) => p.id === editingId) : null;
              const confirmedWithAllocs = editingProject?.status === "confirmed" && (editingProject.allocations ?? []).length > 0;
              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Consultores Fixos</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Consultores específicos já definidos para o projeto</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={addPinnedSlot}>+ Adicionar</button>
                  </div>
                  {form.pinnedSlots.length === 0 && (<div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0" }}>Nenhum consultor fixo adicionado.</div>)}
                  {form.pinnedSlots.map((slot) => {
                    const pinnedConsultant = slot.consultantId ? consultantMap.get(slot.consultantId) ?? null : null;
                    const restricted: Weekday[] = pinnedConsultant ? (pinnedConsultant.restrictions as Weekday[]) : [];
                    const busy: Weekday[] = pinnedConsultant
                      ? (projects.filter((p) => p.status === "confirmed" && p.id !== editingId).flatMap((p) => (p.allocations ?? []).filter((a) => a.consultantId === pinnedConsultant.id).map((a) => a.weekday as Weekday)))
                      : [];
                    return (
                      <div key={slot.id} style={{ background: "var(--bg)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: confirmedWithAllocs ? "1fr auto" : "1fr auto auto auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
                          <div className="form-group">
                            <label className="form-label">Consultor</label>
                            <select className="form-select" value={slot.consultantId ?? ""} onChange={(e) => updatePinnedSlot(slot.id, { consultantId: Number(e.target.value) || null, visitDays: [], _role: undefined })}>
                              <option value="">Selecione...</option>
                              {consultants.map((c) => (<option key={c.id} value={c.id}>{c.name} ({LEVEL_LABELS[c.level]})</option>))}
                            </select>
                          </div>
                          {!confirmedWithAllocs && (
                            <div className="form-group">
                              <label className="form-label">Frequência</label>
                              <select className="form-select" value={slot.cadence ?? ""} onChange={(e) => updatePinnedSlot(slot.id, { cadence: (e.target.value as any) || null })}>
                                <option value="">Igual ao projeto</option>
                                <option value="weekly">Semanal</option>
                                <option value="biweekly_odd">Quinzenal (ímpares)</option>
                                <option value="biweekly_even">Quinzenal (pares)</option>
                              </select>
                            </div>
                          )}
                          {!confirmedWithAllocs && (
                            <div className="form-group">
                              <label className="form-label">Dias/sem</label>
                              <input className="form-input" type="number" min={1} max={pinnedConsultant ? 5 - restricted.length : 5} value={slot.daysPerWeek} onChange={(e) => updatePinnedSlot(slot.id, { daysPerWeek: Number(e.target.value) })} />
                            </div>
                          )}
                          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "end" }} onClick={() => removePinnedSlot(slot.id)}>✕</button>
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            {confirmedWithAllocs ? "Dias de visita" : (slot.consultantId ? "Dias" : "Dias preferidos")}{" "}
                            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                              {confirmedWithAllocs ? `(${slot.visitDays.length > 0 ? slot.visitDays.length + "x/sem" : "selecione os dias"})` : slot.consultantId ? "(selecione os dias exatos)" : "(opcional)"}
                            </span>
                          </label>
                          <DaySelector selected={slot.visitDays} onChange={(days) => updatePinnedSlot(slot.id, { visitDays: days, daysPerWeek: days.length })} restricted={restricted} busy={busy} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="modal-footer">
              {saveError && (<span style={{ fontSize: 12, color: "#c0392b", flex: 1 }}>{saveError}</span>)}
              <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Salvando..." : editingId !== null ? "Atualizar Projeto" : "Salvar Projeto"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
