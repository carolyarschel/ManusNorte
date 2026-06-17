import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FolderKanban, CalendarCheck, AlertTriangle } from "lucide-react";
import { useMemo } from "react";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  hot: "Quente",
  cold: "Frio",
  archived: "Arquivado",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  hot: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  cold: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    start: monday.toISOString().slice(0, 10),
    end: friday.toISOString().slice(0, 10),
  };
}

export default function Dashboard() {
  const { data: consultants = [] } = trpc.consultants.list.useQuery();
  const { data: projectsWithAllocs = [] } = trpc.projects.list.useQuery();
  const projects = projectsWithAllocs;
  const allocations = projectsWithAllocs.flatMap((p) => p.allocations ?? []);

  const stats = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === "confirmed");
    const hotProjects = projects.filter((p) => p.status === "hot");
    const totalAllocations = allocations.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    // Occupation per consultant
    const consultantDays: Record<number, Set<number>> = {};
    for (const a of allocations) {
      if (!consultantDays[a.consultantId]) consultantDays[a.consultantId] = new Set();
      consultantDays[a.consultantId].add(a.weekday);
    }

    const occupancyList = consultants.map((c) => {
      const usedDays = consultantDays[c.id]?.size ?? 0;
      const pct = c.maxDays > 0 ? Math.round((usedDays / c.maxDays) * 100) : 0;
      return { ...c, usedDays, pct };
    }).sort((a, b) => b.pct - a.pct);

    const overloaded = occupancyList.filter((c) => c.pct > 100);
    const fullyOccupied = occupancyList.filter((c) => c.pct >= 80 && c.pct <= 100);

    return { activeProjects, hotProjects, totalAllocations, occupancyList, overloaded, fullyOccupied };
  }, [consultants, projectsWithAllocs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { confirmed: 0, hot: 0, cold: 0, archived: 0 };
    for (const p of projects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [projects]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da equipe e dos projetos</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consultores</p>
                <p className="text-2xl font-bold">{consultants.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <FolderKanban size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proj. Ativos</p>
                <p className="text-2xl font-bold">{stats.activeProjects.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <AlertTriangle size={18} className="text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proj. Quentes</p>
                <p className="text-2xl font-bold">{stats.hotProjects.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10">
                <CalendarCheck size={18} className="text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Alocações</p>
                <p className="text-2xl font-bold">{stats.totalAllocations}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project status breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Projetos por Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${projects.length > 0 ? (count / projects.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Consultant occupancy */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ocupação dos Consultores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {stats.occupancyList.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-24 text-sm truncate text-foreground">{c.name}</div>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      c.pct > 100 ? "bg-destructive" : c.pct >= 80 ? "bg-orange-500" : "bg-primary"
                    }`}
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {c.usedDays}/{c.maxDays} dias
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Active projects list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Projetos Ativos</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.activeProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum projeto confirmado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Sigla</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Início</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Fim</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.activeProjects.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-mono font-medium text-primary">{p.acronym}</td>
                      <td className="py-2 pr-4">{p.client}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.startDate}</td>
                      <td className="py-2 text-muted-foreground">{p.endDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
