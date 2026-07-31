import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients } from "@/hooks/use-operations";
import { useAllServiceTypes, useCreateChecklistItem, useCreateProcess } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import { KANBAN_STAGES, PRIORITY, PROCESS_STAGE, type PriorityLevel, type ProcessStage } from "@/lib/domain";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { clientId?: string };

export const Route = createFileRoute("/_authenticated/processos/novo")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Novo processo — FLUXA" },
      { name: "description", content: "Abra um novo processo com cliente, etapa inicial, prazo e responsável." },
      { property: "og:title", content: "Novo processo — FLUXA" },
      { property: "og:description", content: "Abra um novo processo com cliente, etapa inicial, prazo e responsável." },
    ],
  }),
  component: NewProcess,
});

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function NewProcess() {
  const navigate = useNavigate();
  const { clientId } = Route.useSearch();
  const { organizationId, displayName } = useWorkspace();
  const permissions = usePermissions();
  const clients = useClients(organizationId);
  const serviceTypes = useAllServiceTypes(organizationId);
  const createProcess = useCreateProcess(organizationId);
  const [pendingChecklist, setPendingChecklist] = useState<string[]>([]);

  const [form, setForm] = useState({
    client_id: clientId ?? "",
    service_type_id: "",
    title: "",
    description: "",
    stage: "novo" as ProcessStage,
    priority: "media" as PriorityLevel,
    due_date: "",
    value: "",
    owner_name: "",
  });

  useEffect(() => {
    if (displayName && !form.owner_name) setForm((current) => ({ ...current, owner_name: displayName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const activeTypes = (serviceTypes.data ?? []).filter((type) => type.is_active);

  const applyServiceType = (id: string) => {
    const type = activeTypes.find((item) => item.id === id);
    const checklist = Array.isArray(type?.default_checklist) ? (type?.default_checklist as string[]) : [];
    setPendingChecklist(checklist.filter((item) => typeof item === "string" && item.trim().length > 0));
    setForm((current) => ({
      ...current,
      service_type_id: id,
      title: current.title || (type?.name ?? ""),
      due_date: current.due_date || (type?.default_days ? addDays(type.default_days) : ""),
      value: current.value || (type?.default_value != null ? String(type.default_value) : ""),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId) return;
    if (!form.client_id) {
      toast.error("Selecione o cliente do processo.");
      return;
    }
    try {
      const created = await createProcess.mutateAsync({
        client_id: form.client_id,
        service_type_id: form.service_type_id || null,
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        stage: form.stage,
        priority: form.priority,
        owner_name: form.owner_name.trim() || displayName,
        due_date: form.due_date || null,
        value: form.value ? Number(form.value.replace(",", ".")) : 0,
        financial_status: "nao_aplicavel",
      });
      toast.success(`Processo ${created.code} criado.`);
      navigate({ to: "/processos/$processId", params: { processId: created.id } });
    } catch (error) {
      toast.error(describeError(error, "processo"));
    }
  };

  if (!permissions.canCreate) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Seu perfil tem acesso somente de leitura e não pode abrir processos.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="page-title">Novo processo</h1>
          <p className="page-subtitle mt-1">O número interno é gerado automaticamente ao salvar.</p>

          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(value) => setForm({ ...form, client_id: value })}>
                <SelectTrigger className="h-10" aria-label="Cliente do processo">
                  <SelectValue placeholder={clients.isLoading ? "Carregando…" : "Selecione o cliente"} />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de serviço</Label>
              <Select value={form.service_type_id} onValueChange={applyServiceType}>
                <SelectTrigger className="h-10" aria-label="Tipo de serviço">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pendingChecklist.length > 0 && (
                <p className="helper-text">
                  {pendingChecklist.length} itens de checklist sugeridos serão criados com o processo.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input id="title" maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Etapa inicial</Label>
              <Select value={form.stage} onValueChange={(value) => setForm({ ...form, stage: value as ProcessStage })}>
                <SelectTrigger className="h-10" aria-label="Etapa inicial">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>{PROCESS_STAGE[stage].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as PriorityLevel })}>
                <SelectTrigger className="h-10" aria-label="Prioridade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due">Prazo</Label>
              <Input id="due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner">Responsável</Label>
              <Input
                id="owner"
                maxLength={120}
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input id="value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                rows={3}
                maxLength={600}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={createProcess.isPending} aria-busy={createProcess.isPending}>
                {createProcess.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {createProcess.isPending ? "Criando…" : "Criar processo"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate({ to: "/processos" })}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
