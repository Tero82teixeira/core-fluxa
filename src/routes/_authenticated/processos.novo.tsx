import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { useClients } from "@/hooks/use-operations";
import { useCreateProcess, useServiceTypes } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import { KANBAN_STAGES, PRIORITY, PROCESS_STAGE, type PriorityLevel, type ProcessStage } from "@/lib/domain";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/processos/novo")({
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

function NewProcess() {
  const navigate = useNavigate();
  const { organizationId, displayName } = useWorkspace();
  const clients = useClients(organizationId);
  const serviceTypes = useServiceTypes(organizationId);
  const createProcess = useCreateProcess(organizationId);

  const [form, setForm] = useState({
    client_id: "",
    service_type_id: "",
    title: "",
    description: "",
    stage: "novo" as ProcessStage,
    priority: "media" as PriorityLevel,
    due_date: "",
    value: "",
  });

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
        owner_name: displayName,
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
              <Select value={form.service_type_id} onValueChange={(value) => setForm({ ...form, service_type_id: value })}>
                <SelectTrigger className="h-10" aria-label="Tipo de serviço">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {(serviceTypes.data ?? []).map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
