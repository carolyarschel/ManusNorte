import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarClock, Play, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  hot: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  cold: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado", hot: "Quente", cold: "Frio", archived: "Arquivado",
};

type SchedResult = {
  projectId: number;
  acronym: string;
  feasible: boolean;
  suggestedStartDate: string | null;
  suggestedEndDate: string | null;
  reason: string;
};

export default function Scheduling() {
  const { data: projects = [] } = trpc.projects.list.useQuery();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<SchedResult[] | null>(null);

  const scheduleMutation = trpc.scheduling.run.useMutation({
    onSuccess: (data) => {
      setResults(data as SchedResult[]);
      toast.success("Agendamento concluído!");
    },
    onError: (e) => toast.error(e.message),
  });

  // Show only hot and cold projects
  const targetProjects = projects.filter((p) => p.status === "hot" || p.status === "cold");

  const toggleProject = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(targetProjects.map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());

  const runScheduling = () => {
    if (selectedIds.size === 0) { toast.error("Selecione ao menos um projeto"); return; }
    setResults(null);
    scheduleMutation.mutate({ projectIds: Array.from(selectedIds) });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agendamento de Projetos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sugere datas de início para projetos quentes e frios com base na disponibilidade da equipe
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project selection */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Projetos Hot / Cold</CardTitle>
              <div className="flex gap-2">
                <button className="text-xs text-primary hover:underline" onClick={selectAll}>Todos</button>
                <span className="text-muted-foreground">·</span>
                <button className="text-xs text-muted-foreground hover:underline" onClick={clearAll}>Limpar</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {targetProjects.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum projeto quente ou frio cadastrado
              </p>
            )}
            {targetProjects.map((p) => (
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
              <div className="flex items-center justify-end">
                <Button
                  onClick={runScheduling}
                  disabled={scheduleMutation.isPending || selectedIds.size === 0}
                  className="gap-2"
                >
                  <Play size={15} />
                  {scheduleMutation.isPending ? "Calculando..." : `Agendar (${selectedIds.size} projetos)`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {results && (
            <div className="space-y-4">
              {results.map((result) => {
                const projectId = result.projectId;
                const project = projects.find((p) => p.id === projectId);
                if (!project || !result) return null;

                return (
                  <Card key={projectId} className={cn(
                    "border-l-4",
                    result.feasible ? "border-l-emerald-500" : "border-l-orange-500"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2 mb-3">
                        {result.feasible ? (
                          <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle size={16} className="text-orange-500 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-primary">{project.acronym}</span>
                            <span className="text-sm text-muted-foreground">{project.client}</span>
                          </div>
                          {result.suggestedStartDate && (
                            <div className="flex items-center gap-1.5 mt-1 text-sm font-medium text-foreground">
                              <CalendarClock size={14} className="text-primary" />
                              <span>Início sugerido: <strong>{result.suggestedStartDate}</strong></span>
                            </div>
                          )}
                        </div>
                      </div>

                      {!result.feasible && result.reason && (
                        <div className="flex items-start gap-1.5 text-xs text-orange-700 dark:text-orange-400">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span>{result.reason}</span>
                        </div>
                      )}

                      {result.suggestedEndDate && (
                        <div className="text-xs text-muted-foreground mt-1">Fim estimado: {result.suggestedEndDate}</div>
                      )}

                      {!result.feasible && !result.suggestedStartDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Não foi possível sugerir uma data de início com a equipe atual.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {!results && !scheduleMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <CalendarClock size={40} className="mb-3 opacity-40" />
              <p>Selecione projetos e clique em Agendar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
