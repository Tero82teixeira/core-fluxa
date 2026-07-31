import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, FileText } from "lucide-react";

import { useProcess, useProcessChecklist, useProcessMovements, useTasks } from "@/hooks/use-operations";
import { useWorkspace } from "@/lib/workspace";
import { moveDemoProcess } from "@/lib/demo-store";
import { CHECKLIST_STATUS } from "@/lib/demo-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { notifyDemoAction, notifyDemoSessionChange } from "@/components/shared/demo-notice";
import {
  FINANCIAL_STATUS,
  KANBAN_STAGES,
  PRIORITY,
  PROCESS_STAGE,
  TASK_STATUS,
  type ProcessStage,
} from "@/lib/domain";
import { daysUntil, formatCurrency, formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/processos/$processId")({
  head: () => ({
    meta: [
      { title: "Detalhe do processo — FLUXA" },
      { name: "description", content: "Linha do tempo, checklist documental, prazos e financeiro do processo." },
      { property: "og:title", content: "Detalhe do processo — FLUXA" },
      { property: "og:description", content: "Linha do tempo, checklist documental, prazos e financeiro do processo." },
    ],
  }),
  component: ProcessDetail,
});

function ProcessDetail() {
  const { processId } = Route.useParams();
  const { organizationId } = useWorkspace();
  const process = useProcess(processId);
  const movements = useProcessMovements(processId);
  const checklist = useProcessChecklist(processId);
  const tasks = useTasks(organizationId);

  if (!process.data) {
    return <p className="p-6 text-sm text-muted-foreground">Processo não encontrado.</p>;
  }

  const data = process.data;
  const days = daysUntil(data.due_date);
  const deadlineLabel =
    days === null ? "Sem prazo" : days < 0 ? `Atrasado ${Math.abs(days)} dia(s)` : days === 0 ? "Vence hoje" : `Faltam ${days} dia(s)`;
  const deadlineTone = days === null ? "neutral" : days < 0 ? "danger" : days <= 2 ? "warning" : "success";
  const docsPct = data.documents_total ? Math.round((data.documents_received / data.documents_total) * 100) : 0;
  const relatedTasks = (tasks.data ?? []).filter((task) => task.process_id === processId);
  const currentIndex = KANBAN_STAGES.indexOf(data.stage);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold">
              {data.code} — {data.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link to="/clientes/$clientId" params={{ clientId: data.client_id }} className="underline-offset-2 hover:underline">
                {data.clients?.name}
              </Link>{" "}
              · Responsável {data.owner_name} · Protocolo {data.protocol ?? "não protocolado"}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{data.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusBadge label={PROCESS_STAGE[data.stage].label} tone={PROCESS_STAGE[data.stage].tone} />
              <StatusBadge label={PRIORITY[data.priority].label} tone={PRIORITY[data.priority].tone} />
              <StatusBadge label={deadlineLabel} tone={deadlineTone} />
              <StatusBadge
                label={FINANCIAL_STATUS[data.financial_status].label}
                tone={FINANCIAL_STATUS[data.financial_status].tone}
              />
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <Select
              value={data.stage}
              onValueChange={(value) => {
                moveDemoProcess(processId, value as ProcessStage);
                notifyDemoSessionChange(`${data.code} agora está em ${PROCESS_STAGE[value as ProcessStage].label}.`);
              }}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KANBAN_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>{PROCESS_STAGE[stage].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => notifyDemoAction("Registro de movimentação")}>
              Registrar movimentação
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Progresso do fluxo</span>
            <span className="text-muted-foreground">
              Etapa {currentIndex + 1} de {KANBAN_STAGES.length}
            </span>
          </div>
          <ol className="mt-4 flex flex-wrap gap-2">
            {KANBAN_STAGES.map((stage, index) => (
              <li
                key={stage}
                className={`rounded-full border px-3 py-1 text-xs ${
                  index < currentIndex
                    ? "border-success/40 bg-success/10 text-success"
                    : index === currentIndex
                      ? "border-brand bg-brand/10 font-medium text-brand"
                      : "border-border text-muted-foreground"
                }`}
              >
                {PROCESS_STAGE[stage].short ?? PROCESS_STAGE[stage].label}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Tabs defaultValue="timeline">
          <TabsList className="flex-wrap">
            <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas ({relatedTasks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <Card>
              <CardContent className="p-6">
                <ul className="space-y-4">
                  {(movements.data ?? []).map((movement) => (
                    <li key={movement.id} className="border-l-2 border-border pl-4">
                      <p className="text-sm font-medium">{movement.description}</p>
                      {movement.from_stage && movement.to_stage && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {PROCESS_STAGE[movement.from_stage].label} → {PROCESS_STAGE[movement.to_stage].label}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {movement.actor_name ?? "Sistema"} · {relativeTime(movement.created_at)}
                      </p>
                    </li>
                  ))}
                  {(movements.data ?? []).length === 0 && (
                    <li className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documentos">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Checklist documental</span>
                  <span className="text-muted-foreground">
                    {data.documents_received}/{data.documents_total} recebidos
                  </span>
                </div>
                <Progress value={docsPct} className="mt-3 h-1.5" />
                <ul className="mt-4 space-y-2">
                  {(checklist.data ?? []).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="flex min-w-0 items-center gap-2">
                        {item.status === "aprovado" ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                        ) : (
                          <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                        <span className="truncate text-sm">{item.name}</span>
                      </span>
                      <StatusBadge label={CHECKLIST_STATUS[item.status].label} tone={CHECKLIST_STATUS[item.status].tone} />
                    </li>
                  ))}
                  {(checklist.data ?? []).length === 0 && (
                    <li className="py-4 text-sm text-muted-foreground">Nenhum documento exigido neste processo.</li>
                  )}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => notifyDemoAction("Upload de documentos")}
                >
                  <FileText className="size-4" aria-hidden /> Enviar documento
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tarefas">
            <Card>
              <CardContent className="p-6">
                <ul className="space-y-3">
                  {relatedTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(task.due_at)} · {task.assignee_name}
                        </p>
                      </div>
                      <StatusBadge label={TASK_STATUS[task.status].label} tone={TASK_STATUS[task.status].tone} />
                    </li>
                  ))}
                  {relatedTasks.length === 0 && (
                    <li className="text-sm text-muted-foreground">Nenhuma tarefa vinculada.</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold">Resumo</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Abertura</dt>
                  <dd>{formatDate(data.opened_at)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Prazo</dt>
                  <dd>{formatDate(data.due_date)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Última movimentação</dt>
                  <dd>{relativeTime(data.last_movement_at)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd>{formatCurrency(data.value)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold">Próxima ação sugerida</h3>
              <p className="mt-2 text-sm text-muted-foreground">{data.next_action}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
