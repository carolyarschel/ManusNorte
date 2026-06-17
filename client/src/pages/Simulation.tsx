import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Cpu, CheckCircle, XCircle, AlertTriangle, Calendar, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" };
const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  hot: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  cold: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado", hot: "Quente", cold: "Frio", archived: "Arquivado",
};

type SimResult = {
  feasible: boolean;
  issues: string[];
  suggestions: string[];
  proposed: Array<{ consultantId: number; weekday: number; role: string }>;
  earliestFeasibleDate: string | null;
};

export default function Simulation() {
  const utils = trpc.useUtils();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: consultants = [] } = trpc.consultants.list.useQuery();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [randomize, setRandomize] = useState(false);
  const [results, setResults] = useState<Record<number, SimResult> | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);

  const simulateMutation = trpc.simulation.run.useMutation({
    onSuccess: (data) => {
      setResults(data as Record<number, SimResult>);
      toast.success("Simulação concluída!");
    },
    onError: (e) => toast.error(e.message),
  });

  const setAllocMutation = trpc.projects.setAllocations.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Alocações aplicadas!");
      setApplyingId(null);
    },
    onError: (e) => { toast.error(e.message); setApplyingId(null); },
  });

  const activeProjects = projects.filter((p) => p.status !== "archived");

  const toggleProject = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(activeProjects.map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());

  const runSimulation = () => {
    if (selectedIds.size === 0) { toast.error("Selecione ao menos um projeto"); return; }
    setResults(null);
    simulateMutation.mutate({ projectIds: Array.from(selectedIds), randomize });
  };

  const applyResult = (projectId: number, proposed: Array<{ consultantId: number; weekday: number; role: string }>) => {
    setApplyingId(projectId);
    setAllocMutation.mutate({
      projectId,
      allocations: proposed.map((p) => ({ consultantId: p.consultantId, weekday: p.weekday, role: p.role as "líder" | "consultor" })),
    });
  };

  const getConsultantName = (id: number) => consultants.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Simulação de Alocações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sugere distribuição automática de consultores com base em disponibilidade e restrições
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project selection */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Projetos</CardTitle>
              <div className="flex gap-2">
                <button className="text-xs text-primary hover:underline" onClick={selectAll}>Todos</button>
                <span className="text-muted-foreground">·</span>
                <button className="text-xs text-muted-foreground hover:underline" onClick={clearAll}>Limpar</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {activeProjects.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum projeto ativo</p>
            )}
            {activeProjects.map((p) => (
              <label
                key={p.id}
                className={cn(
                  "flex items-center gap-3 rounded-md p-2.5 cursor-pointer border transition-colors",
                  selectedIds.has(p.id)
                    ? "border-primary/30 bg-primary/5"
                    : "border-transparent hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => toggleProject(p.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm text-primary">{p.acronym}</span>
                    <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUS_COLORS[p.status])}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.client}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Controls + Results */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Switch checked={randomize} onCheckedChange={setRandomize} />
                  <Label className="cursor-pointer">Randomizar seleção de consultores</Label>
                </div>
                <Button
                  onClick={runSimulation}
                  disabled={simulateMutation.isPending || selectedIds.size === 0}
                  className="gap-2"
                >
                  <Play size={15} />
                  {simulateMutation.isPending ? "Simulando..." : `Simular (${selectedIds.size} projetos)`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {results && (
            <div className="space-y-4">
              {Array.from(selectedIds).map((projectId) => {
                const project = projects.find((p) => p.id === projectId);
                const result = results[projectId];
                if (!project || !result) return null;

                return (
                  <Card key={projectId} className={cn(
                    "border-l-4",
                    result.feasible ? "border-l-emerald-500" : "border-l-orange-500"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {result.feasible ? (
                              <CheckCircle size={16} className="text-emerald-500" />
                            ) : (
                              <XCircle size={16} className="text-orange-500" />
                            )}
                            <span className="font-mono font-semibold text-primary">{project.acronym}</span>
                            <span className="text-sm text-muted-foreground">{project.client}</span>
                          </div>
                          {!result.feasible && result.earliestFeasibleDate && (
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Calendar size={12} />
                              <span>Mais cedo viável: <strong>{result.earliestFeasibleDate}</strong></span>
                            </div>
                          )}
                        </div>
                        {result.proposed.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applyResult(projectId, result.proposed)}
                            disabled={applyingId === projectId}
                            className="text-xs"
                          >
                            Aplicar alocações
                          </Button>
                        )}
                      </div>

                      {result.issues.length > 0 && (
                        <div className="mb-3 space-y-1">
                          {result.issues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-orange-700 dark:text-orange-400">
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {result.suggestions.length > 0 && (
                        <div className="mb-3 space-y-1">
                          {result.suggestions.map((s, i) => (
                            <div key={i} className="text-xs text-sky-700 dark:text-sky-400">💡 {s}</div>
                          ))}
                        </div>
                      )}

                      {result.proposed.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Alocações propostas:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {result.proposed.map((p, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
                              >
                                <span className="font-medium">{getConsultantName(p.consultantId)}</span>
                                <span className="text-muted-foreground">—</span>
                                <span>{WEEKDAY_LABELS[p.weekday]}</span>
                                {p.role === "líder" && <span className="text-amber-500">★</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.proposed.length === 0 && !result.feasible && (
                        <p className="text-xs text-muted-foreground">Não foi possível sugerir alocações para este projeto.</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {!results && !simulateMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Cpu size={40} className="mb-3 opacity-40" />
              <p>Selecione projetos e clique em Simular</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
