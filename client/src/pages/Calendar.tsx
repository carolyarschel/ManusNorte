import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  getMondayOfWeek, addDays, fmtDate, getISOWeek,
  jsDateToWeekday, getProjectColor,
  DAY_NAMES, LEVEL_LABELS,
} from "@/lib/domain";
import { Avatar } from "@/components/ui/NorteUI";
import type { Weekday } from "@/types/index";

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function CalendarPage() {
  const { consultants, projects, absences } = useAppStore();
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const weekDays = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
  const weekNum  = getISOWeek(weekStart);
  const monthLabel = `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
  const activeProjects = projects.filter((p) => p.status !== "archived");

  function getChips(consultantId: number, date: Date) {
    const weekday = jsDateToWeekday(date);
    if (!weekday) return [];
    return activeProjects
      .filter((p) => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        if (date < start || date > end) return false;
        if (p.cadence === "biweekly_odd"  && getISOWeek(date) % 2 === 0) return false;
        if (p.cadence === "biweekly_even" && getISOWeek(date) % 2 === 1) return false;
        if ((p.allocations ?? []).length > 0) {
          return p.allocations!.some(
            (a) => a.consultantId === consultantId && a.weekday === weekday
          );
        }
        return (
          (p.allocatedConsultants ?? []).includes(consultantId) &&
          (p.visitDays ?? []).includes(weekday)
        );
      })
      .map((p) => {
        const alloc = (p.allocations ?? []).find(
          (a) => a.consultantId === consultantId && a.weekday === weekday
        );
        return {
          project: p,
          role: alloc?.role === "lider" || alloc?.role === "líder" ? "Líder" : "Consultor",
          color: getProjectColor(p.id, projects),
        };
      });
  }

  function isRestricted(consultantId: number, date: Date): boolean {
    const c = consultants.find((x) => x.id === consultantId);
    if (!c) return false;
    const d = date.getDay();
    const wd: Weekday = (d === 0 ? 7 : d) as Weekday;
    return c.restrictions.includes(wd);
  }

  function isAbsent(consultantId: number, date: Date): string | null {
    const dateStr = date.toISOString().slice(0, 10);
    const abs = absences.find(
      (a) => a.consultantId === consultantId && a.startDate <= dateStr && a.endDate >= dateStr
    );
    return abs ? (abs.reason ?? "Ausência") : null;
  }

  return (
    <>
      <div className="cal-nav-bar">
        <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart((d) => addDays(d, -7))}>‹ Anterior</button>
        <div className="cal-month-title">{monthLabel}</div>
        <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart((d) => addDays(d, 7))}>Próximo ›</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(getMondayOfWeek(new Date()))}>Hoje</button>
        <span className="cal-week-label">Semana {weekNum} ({fmtDate(weekStart)}–{fmtDate(weekDays[4])})</span>
      </div>
      <div className="page-content">
        <div className="cal-table-wrap">
          <table className="cal-table">
            <thead>
              <tr>
                <th>CONSULTOR</th>
                {weekDays.map((d, i) => (
                  <th key={i}><span className="cal-th-day">{DAY_NAMES[i + 1]} {fmtDate(d)}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consultants.map((c, ci) => (
                <tr key={c.id}>
                  <td>
                    <div className="cal-consultant">
                      <Avatar name={c.name} index={ci} size={29} />
                      <div>
                        <div className="cal-name">{c.name.split(" ")[0]}</div>
                        <div className="cal-sub">{LEVEL_LABELS[c.level]}{c.isLeader ? " ★" : ""}</div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d, di) => {
                    const chips      = getChips(c.id, d);
                    const restricted = isRestricted(c.id, d);
                    const absReason  = isAbsent(c.id, d);
                    return (
                      <td key={di}>
                        <div className={`cal-cell${restricted && !chips.length && !absReason ? " restricted" : ""}`}
                          style={absReason ? { background: "rgba(231,76,60,0.07)" } : undefined}>
                          {absReason && (
                            <div style={{ fontSize: 9, color: "#c0392b", fontWeight: 600, padding: "2px 4px", borderBottom: "1px dashed rgba(231,76,60,0.3)", marginBottom: 2 }} title={absReason}>
                              🚫 {absReason.length > 12 ? absReason.slice(0, 12) + "…" : absReason}
                            </div>
                          )}
                          {!chips.length && !absReason && restricted && (
                            <span className="restricted-dot" title="Dia restrito" />
                          )}
                          {chips.map((ch, chi) => (
                            <div key={chi} className="cal-chip" style={{ background: ch.color.bg, borderLeftColor: ch.color.border, color: ch.color.text }} title={`${ch.project.client} — ${ch.role}`}>
                              <span className="cal-chip-acronym">{ch.project.acronym}</span>
                              <span className="cal-chip-role">— {ch.role}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
