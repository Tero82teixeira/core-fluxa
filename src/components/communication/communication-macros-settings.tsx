import { Pencil, Plus, WandSparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCommunicationMacros,
  useSaveCommunicationMacro,
  type CommunicationMacro,
} from "@/hooks/use-communication-macros";
import type { CommunicationPriority, CommunicationStatus } from "@/lib/communication";
import { describeError } from "@/lib/errors";

const empty = {
  id: null as string | null,
  title: "",
  replyContent: "",
  statusAfter: null as CommunicationStatus | null,
  priorityAfter: null as CommunicationPriority | null,
  assignToSelf: false,
  followUpHours: null as number | null,
  isActive: true,
};
const statusOptions: [CommunicationStatus, string][] = [
  ["aberta", "Aberta"],
  ["aguardando_cliente", "Aguardando cliente"],
  ["aguardando_equipe", "Aguardando equipe"],
  ["resolvida", "Resolvida"],
];
const priorityOptions: [CommunicationPriority, string][] = [
  ["baixa", "Baixa"],
  ["normal", "Normal"],
  ["alta", "Alta"],
  ["urgente", "Urgente"],
];

export function CommunicationMacrosSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const query = useCommunicationMacros(organizationId, canManage);
  const save = useSaveCommunicationMacro(organizationId);
  const [form, setForm] = useState(empty);
  if (!canManage) return null;
  const edit = (macro: CommunicationMacro) =>
    setForm({
      id: macro.id,
      title: macro.title,
      replyContent: macro.reply_content ?? "",
      statusAfter: macro.status_after,
      priorityAfter: macro.priority_after,
      assignToSelf: macro.assign_to_self,
      followUpHours: macro.follow_up_hours,
      isActive: macro.is_active,
    });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 2) return toast.error("Informe o nome da macro.");
    if (
      !form.replyContent.trim() &&
      !form.statusAfter &&
      !form.priorityAfter &&
      !form.assignToSelf &&
      !form.followUpHours
    )
      return toast.error("Escolha ao menos uma ação para a macro.");
    try {
      await save.mutateAsync(form);
      toast.success(form.id ? "Macro atualizada." : "Macro criada.");
      setForm(empty);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <WandSparkles className="size-4 text-primary" />
              Macros de atendimento
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Aplique mensagem, status, prioridade, responsável e retorno em uma ação. A mensagem
              continua como rascunho.
            </p>
          </div>
          {form.id && (
            <Button variant="outline" size="sm" onClick={() => setForm(empty)}>
              <X className="size-4" />
              Cancelar edição
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <form
          className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2"
          onSubmit={submit}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="macro-title">Nome</Label>
            <Input
              id="macro-title"
              maxLength={80}
              value={form.title}
              placeholder="Ex.: Receber e retornar em 24 horas"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="macro-reply">Mensagem opcional</Label>
            <Textarea
              id="macro-reply"
              rows={3}
              maxLength={2000}
              value={form.replyContent}
              onChange={(e) => setForm({ ...form, replyContent: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.statusAfter ?? "none"}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  statusAfter: value === "none" ? null : (value as CommunicationStatus),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não alterar</SelectItem>
                {statusOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={form.priorityAfter ?? "none"}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  priorityAfter: value === "none" ? null : (value as CommunicationPriority),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não alterar</SelectItem>
                {priorityOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="macro-follow">Retornar em horas</Label>
            <Input
              id="macro-follow"
              type="number"
              min={1}
              max={720}
              value={form.followUpHours ?? ""}
              placeholder="Ex.: 24"
              onChange={(e) =>
                setForm({ ...form, followUpHours: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div className="flex flex-col justify-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.assignToSelf}
                onCheckedChange={(value) => setForm({ ...form, assignToSelf: Boolean(value) })}
              />
              Atribuir a mim
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isActive}
                onCheckedChange={(value) => setForm({ ...form, isActive: value })}
              />
              Disponível para a equipe
            </label>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button disabled={save.isPending}>
              {form.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {form.id ? "Salvar alterações" : "Criar macro"}
            </Button>
          </div>
        </form>
        {query.isLoading ? (
          <p className="py-5 text-center text-sm text-muted-foreground">Carregando macros…</p>
        ) : (query.data?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nenhuma macro cadastrada.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {query.data?.map((macro) => (
              <li key={macro.id} className="rounded-xl border p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <strong className="text-sm">{macro.title}</strong>
                      <Badge variant={macro.is_active ? "secondary" : "outline"}>
                        {macro.is_active ? "Ativa" : "Pausada"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {macro.reply_content || "Macro sem mensagem"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${macro.title}`}
                    onClick={() => edit(macro)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
