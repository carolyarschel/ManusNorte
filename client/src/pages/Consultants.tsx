import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const WEEKDAY_LABELS: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" };
const LEVEL_LABELS: Record<string, string> = { junior: "Júnior", pleno: "Pleno", senior: "Sênior" };

type ConsultantForm = {
  name: string;
  level: "junior" | "pleno" | "senior";
  isLeader: boolean;
  maxDays: number;
  restrictions: number[];
  notes: string;
};

const defaultForm: ConsultantForm = {
  name: "",
  level: "pleno",
  isLeader: false,
  maxDays: 5,
  restrictions: [],
  notes: "",
};

export default function Consultants() {
  const utils = trpc.useUtils();
  const { data: consultants = [], isLoading } = trpc.consultants.list.useQuery();

  const createMutation = trpc.consultants.create.useMutation({
    onSuccess: () => { utils.consultants.list.invalidate(); toast.success("Consultor criado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.consultants.update.useMutation({
    onSuccess: () => { utils.consultants.list.invalidate(); toast.success("Consultor atualizado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.consultants.remove.useMutation({
    onSuccess: () => { utils.consultants.list.invalidate(); toast.success("Consultor removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ConsultantForm>(defaultForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (c: typeof consultants[0]) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      level: c.level,
      isLeader: c.isLeader,
      maxDays: c.maxDays,
      restrictions: (c.restrictions as number[]) ?? [],
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const data = { ...form, notes: form.notes || null };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleRestriction = (day: number) => {
    setForm((f) => ({
      ...f,
      restrictions: f.restrictions.includes(day)
        ? f.restrictions.filter((d) => d !== day)
        : [...f.restrictions, day],
    }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consultores</h1>
          <p className="text-sm text-muted-foreground mt-1">{consultants.length} consultores cadastrados</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} className="mr-1" />
          Novo Consultor
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : consultants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={40} className="text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum consultor cadastrado</p>
          <Button onClick={openCreate} size="sm" className="mt-4">Adicionar primeiro consultor</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {consultants.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground capitalize">{LEVEL_LABELS[c.level]}</span>
                      {c.isLeader && (
                        <Badge variant="secondary" className="text-xs py-0">Líder</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Remover ${c.name}?`)) removeMutation.mutate({ id: c.id }); }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0">Máx. dias:</span>
                    <span className="font-medium text-foreground">{c.maxDays}</span>
                  </div>
                  {(c.restrictions as number[])?.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0">Restrições:</span>
                      <div className="flex gap-1">
                        {(c.restrictions as number[]).map((d) => (
                          <span key={d} className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
                            {WEEKDAY_LABELS[d]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.notes && (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">{c.notes}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Consultor" : "Novo Consultor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome do consultor"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nível</Label>
                <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v as ConsultantForm["level"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior">Júnior</SelectItem>
                    <SelectItem value="pleno">Pleno</SelectItem>
                    <SelectItem value="senior">Sênior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Máx. dias/semana</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={form.maxDays}
                  onChange={(e) => setForm((f) => ({ ...f, maxDays: parseInt(e.target.value) || 5 }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isLeader}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isLeader: v }))}
              />
              <Label>Perfil de líder</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Restrições de dias</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleRestriction(d)}
                    className={`rounded px-3 py-1.5 text-xs font-medium border transition-colors ${
                      form.restrictions.includes(d)
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : "bg-muted text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {WEEKDAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Observações sobre o consultor..."
                rows={2}
              />
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
    </div>
  );
}
