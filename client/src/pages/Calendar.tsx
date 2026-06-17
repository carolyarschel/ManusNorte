import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { num: 1, label: "Seg" },
  { num: 2, label: "Ter" },
  { num: 3, label: "Qua" },
  { num: 4, label: "Qui" },
  { num: 5, label: "Sex" },
];

const PROJECT_COLORS = [
  "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800",
  "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800",
  "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800",
  "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800",
];

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isProjectActiveOnWeek(project: { startDate: string; endDate: string; cadence: string }, weekStart: Date): boolean {
  const ws = dateStr(weekStart);
  const we = dateStr(new Date(weekStart.getTime() + 4 * 86400000));
  return project.startDate <= we && project.endDate >= ws;
}

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function cadenceMatchesWeek(cadence: string, weekStart: Date): boolean {
  if (cadence === "weekly") return true;
  const weekNum = isoWeekNumber(weekStart);
  if (cadence === "biweekly_odd") return weekNum % 2 !== 0;
  if (cadence === "biweekly_even") return weekNum % 2 === 0;
  return true;
}

export default function Calendar() {
  const [currentMonday, setCurrentMonday] = useState(() => getMondayOfWeek(new Date()));

  const { data: consultants = [] } = trpc.consultants.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();

  const weekDates = useMemo(() => getWeekDates(currentMonday), [currentMonday]);

  const projectColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    let i = 0;
    for (const p of projects) {
      map[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length];
      i++;
    }
    return map;
  }, [projects]);

  // Build a map: consultantId -> weekday -> list of {project, role}
  const allocationMap = useMemo(() => {
    const map: Record<number, Record<number, Array<{ project: typeof projects[0]; role: string }>>> = {};
    for (const c of consultants) {
      map[c.id] = {};
      for (const wd of [1, 2, 3, 4, 5]) map[c.id][wd] = [];
    }
    for (const p of projects) {
      if (p.status === "archived") continue;
      if (!isProjectActiveOnWeek(p, currentMonday)) continue;
      if (!cadenceMatchesWeek(p.cadence, currentMonday)) continue;
      for (const a of p.allocations ?? []) {
        if (!map[a.consultantId]) map[a.consultantId] = {};
        if (!map[a.consultantId][a.weekday]) map[a.consultantId][a.weekday] = [];
        map[a.consultantId][a.weekday].push({ project: p, role: a.role });
      }
    }
    return map;
  }, [projects, consultants, currentMonday]);

  const prevWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() - 7);
    setCurrentMonday(d);
  };

  const nextWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + 7);
    setCurrentMonday(d);
  };

  const goToToday = () => setCurrentMonday(getMondayOfWeek(new Date()));

  const todayStr = dateStr(new Date());
  const weekNum = isoWeekNumber(currentMonday);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calendário de Alocações</h1>
          <p className="text-sm text-muted-foreground mt-1">Semana {weekNum} — {formatDate(weekDates[0])} a {formatDate(weekDates[4])}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            <CalendarIcon size={14} className="mr-1" />
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevWeek}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextWeek}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground w-36 sticky left-0 bg-muted/40">
                Consultor
              </th>
              {WEEKDAYS.map((wd, i) => {
                const date = weekDates[i];
                const isToday = dateStr(date) === todayStr;
                return (
                  <th
                    key={wd.num}
                    className={cn(
                      "text-center py-3 px-2 font-medium min-w-[120px]",
                      isToday ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <div>{wd.label}</div>
                    <div className={cn("text-xs font-normal mt-0.5", isToday ? "text-primary font-semibold" : "text-muted-foreground/70")}>
                      {formatDate(date)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {consultants.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum consultor cadastrado
                </td>
              </tr>
            )}
            {consultants.map((consultant, idx) => (
              <tr
                key={consultant.id}
                className={cn(
                  "border-b border-border/50 hover:bg-muted/20 transition-colors",
                  idx % 2 === 0 ? "" : "bg-muted/10"
                )}
              >
                <td className="py-2 px-4 sticky left-0 bg-card">
                  <div className="font-medium text-foreground">{consultant.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{consultant.level}</div>
                </td>
                {WEEKDAYS.map((wd) => {
                  const slots = allocationMap[consultant.id]?.[wd.num] ?? [];
                  const isRestricted = (consultant.restrictions as number[])?.includes(wd.num);
                  return (
                    <td
                      key={wd.num}
                      className={cn(
                        "py-2 px-2 align-top",
                        isRestricted && slots.length === 0 ? "bg-muted/30" : ""
                      )}
                    >
                      <div className="flex flex-col gap-1 min-h-[2rem]">
                        {slots.map(({ project, role }, i) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-xs font-medium leading-tight",
                              projectColorMap[project.id]
                            )}
                            title={`${project.client} — ${role}`}
                          >
                            <span className="font-mono font-semibold">{project.acronym}</span>
                            {role === "líder" && (
                              <span className="ml-1 opacity-70 text-[10px]">★</span>
                            )}
                          </div>
                        ))}
                        {isRestricted && slots.length === 0 && (
                          <div className="text-[10px] text-muted-foreground/50 text-center">—</div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {projects
          .filter((p) => p.status !== "archived" && isProjectActiveOnWeek(p, currentMonday))
          .map((p) => (
            <div
              key={p.id}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", projectColorMap[p.id])}
            >
              <span className="font-mono font-semibold">{p.acronym}</span>
              <span className="opacity-70">{p.client}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
