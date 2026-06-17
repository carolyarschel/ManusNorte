import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, FolderKanban, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Semanal",
  biweekly_odd: "Quinzenal Ímpar",
  biweekly_even: "Quinzenal Par",
};

const WEEKDAY_LABELS: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" };

type ProjectForm = {
  acronym: string;
  client: string;
  status: "confirmed" | "hot" | "cold" | "archived";
  startDate: string;
  endDate: string;
  cadence: "weekly" | "biweekly_odd" | "biweekly_even";
  leaderConsultantId: number | null;
};

const defaultForm: ProjectForm = {
  acronym: "",
  client: "",
  status: "cold",
  startDate: "",
  endDate: "",
  cadence: "weekly",
  leaderConsultantId: null,
};

// Allocation management dialog
function AllocationDialog({
  project,
  consultants,
  onClose,
}: {
  project: { id: number; acronym: string; allocations: Array<{ consultantId: number; weekday: number; role: string }> };
  consultants: Array<{ id: number; name: string }>;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [allocations, setAllocations] = useState<Array<{ consultantId: number; weekday: number; role: "líder" | "consultor" }>>(
    (project.allocations ?? []).map((a) => ({ consultantId: a.consultantId, weekday: a.weekday, role: a.role as "líder" | "consultor" }))
  );

  const setMutation = trpc.projects.setAllocations.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Alocações salvas!"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const addAllocation = () => {
    if (consultants.length === 0) return;
    setAllocations((a) => [...a, { consultantId: consultants[0].id, weekday: 1, role: "consultor" }]);
  };

  const removeAllocation = (idx: number) => setAllocations((a) => a.filter((_, i) => i !== idx));

  const updateAllocation = (idx: number, field: string, value: unknown) => {
    setAllocations((a) => a.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alocações — {project.acronym}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto py-2">
          {allocations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma alocação definida</p>
          )}
          {allocations.map((a, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select
                value={String(a.consultantId)}
                onValueChange={(v) => updateAllocation(idx, "consultantId", parseInt(v))}
              >
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {consultants.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(a.weekday)}
                onValueChange={(v) => updateAllocation(idx, "weekday", parseInt(v))}
              >
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <SelectItem key={d} value={String(d)}>{WEEKDAY_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={a.role}
                onValueChange={(v) => updateAllocation(idx, "role", v)}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultor">Consultor</SelectItem>
                  <SelectItem value="líder">Líder</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeAllocation(idx)}>
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addAllocation} className="w-full">
          <Plus size={14} className="mr-1" />
          Adicionar alocação
        </Button>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => setMutation.mutate({ projectId: project.id, allocations })} disabled={setMutation.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Projects() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const { data: consultants = [] } = trpc.consultants.list.useQuery();

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Projeto criado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Projeto atualizado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.projects.remove.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Projeto removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectForm>(defaultForm);
  const [allocDialogProject, setAllocDialogProject] = useState<typeof projects[0] | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (p: typeof projects[0]) => {
    setEditingId(p.id);
    setForm({
      acronym: p.acronym,
      client: p.client,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      cadence: p.cadence,
      leaderConsultantId: p.leaderConsultantId ?? null,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.acronym.trim() || !form.client.trim() || !form.startDate || !form.endDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filteredProjects = useMemo(() => {
    if (activeTab === "all") return projects;
    return projects.filter((p) => p.status === activeTab);
  }, [projects, activeTab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length, confirmed: 0, hot: 0, cold: 0, archived: 0 };
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projetos</h1>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} projetos cadastrados</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} className="mr-1" />
          Novo Projeto
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Todos ({counts.all})</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmados ({counts.confirmed})</TabsTrigger>
          <TabsTrigger value="hot">Quentes ({counts.hot})</TabsTrigger>
          <TabsTrigger value="cold">Frios ({counts.cold})</TabsTrigger>
          <TabsTrigger value="archived">Arquivados ({counts.archived})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderKanban size={40} className="text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum projeto nesta categoria</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Sigla</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Início</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fim</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cadência</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Alocações</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-primary">{p.acronym}</td>
                  <td className="py-3 px-4 font-medium">{p.client}</td>
                  <td className="py-3 px-4">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[p.status])}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{p.startDate}</td>
                  <td className="py-3 px-4 text-muted-foreground">{p.endDate}</td>
                  <td className="py-3 px-4 text-muted-foreground">{CADENCE_LABELS[p.cadence]}</td>
                  <td className="py-3 px-4">
                    <button
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                      onClick={() => setAllocDialogProject(p)}
                    >
                      <Users size={12} />
                      {(p.allocations ?? []).length} alocações
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Remover ${p.acronym}?`)) removeMutation.mutate({ id: p.id }); }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sigla (até 5 chars)</Label>
                <Input
                  value={form.acronym}
                  onChange={(e) => setForm((f) => ({ ...f, acronym: e.target.value.toUpperCase().slice(0, 5) }))}
                  placeholder="EX: PROJ"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectForm["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="hot">Quente</SelectItem>
                    <SelectItem value="cold">Frio</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input
                value={form.client}
                onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de início</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de fim</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cadência</Label>
              <Select value={form.cadence} onValueChange={(v) => setForm((f) => ({ ...f, cadence: v as ProjectForm["cadence"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly_odd">Quinzenal Ímpar</SelectItem>
                  <SelectItem value="biweekly_even">Quinzenal Par</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Líder do projeto</Label>
              <Select
                value={form.leaderConsultantId ? String(form.leaderConsultantId) : "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, leaderConsultantId: v === "none" ? null : parseInt(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Sem líder definido" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem líder</SelectItem>
                  {consultants.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {allocDialogProject && (
        <AllocationDialog
          project={allocDialogProject}
          consultants={consultants}
          onClose={() => setAllocDialogProject(null)}
        />
      )}
    </div>
  );
}
