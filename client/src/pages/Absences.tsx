import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, CalendarOff } from "lucide-react";
import { toast } from "sonner";

type AbsenceForm = {
  consultantId: number | null;
  startDate: string;
  endDate: string;
  reason: string;
};

const defaultForm: AbsenceForm = {
  consultantId: null,
  startDate: "",
  endDate: "",
  reason: "",
};

export default function Absences() {
  const utils = trpc.useUtils();
  const { data: absences = [], isLoading } = trpc.absences.list.useQuery();
  const { data: consultants = [] } = trpc.consultants.list.useQuery();

  const createMutation = trpc.absences.create.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); toast.success("Ausência registrada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.absences.update.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); toast.success("Ausência atualizada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.absences.remove.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); toast.success("Ausência removida!"); },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AbsenceForm>(defaultForm);
  const [filterConsultantId, setFilterConsultantId] = useState<string>("all");

  const consultantMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of consultants) m[c.id] = c.name;
    return m;
  }, [consultants]);

  const filteredAbsences = useMemo(() => {
    if (filterConsultantId === "all") return absences;
    return absences.filter((a) => a.consultantId === parseInt(filterConsultantId));
  }, [absences, filterConsultantId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm, consultantId: consultants[0]?.id ?? null });
    setDialogOpen(true);
  };

  const openEdit = (a: typeof absences[0]) => {
    setEditingId(a.id);
    setForm({
      consultantId: a.consultantId,
      startDate: a.startDate,
      endDate: a.endDate,
      reason: a.reason ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.consultantId || !form.startDate || !form.endDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (form.startDate > form.endDate) {
      toast.error("Data de início deve ser anterior à data de fim");
      return;
    }
    const data = {
      consultantId: form.consultantId,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason || null,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: { startDate: data.startDate, endDate: data.endDate, reason: data.reason } });
    } else {
      createMutation.mutate(data);
    }
  };

  function formatDateBR(d: string): string {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }

  function durationDays(start: string, end: string): number {
    const a = new Date(start);
    const b = new Date(end);
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ausências</h1>
          <p className="text-sm text-muted-foreground mt-1">{absences.length} ausências registradas</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterConsultantId} onValueChange={setFilterConsultantId}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="Filtrar por consultor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os consultores</SelectItem>
              {consultants.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm">
            <Plus size={16} className="mr-1" />
            Nova Ausência
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredAbsences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarOff size={40} className="text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma ausência registrada</p>
          <Button onClick={openCreate} size="sm" className="mt-4">Registrar ausência</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Consultor</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Início</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fim</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Duração</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Motivo</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAbsences.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-medium">{consultantMap[a.consultantId] ?? `#${a.consultantId}`}</td>
                  <td className="py-3 px-4 text-muted-foreground">{formatDateBR(a.startDate)}</td>
                  <td className="py-3 px-4 text-muted-foreground">{formatDateBR(a.endDate)}</td>
                  <td className="py-3 px-4 text-muted-foreground">{durationDays(a.startDate, a.endDate)} dias</td>
                  <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">{a.reason ?? "—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Remover ausência?")) removeMutation.mutate({ id: a.id }); }}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Ausência" : "Nova Ausência"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Select
                value={form.consultantId ? String(form.consultantId) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, consultantId: parseInt(v) }))}
                disabled={editingId !== null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o consultor" />
                </SelectTrigger>
                <SelectContent>
                  {consultants.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex: Férias, licença médica..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Salvar" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
