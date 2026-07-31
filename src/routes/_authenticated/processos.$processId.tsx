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

  const secondary = [
    { label: "Número interno", value: data.code },
    { label: "Protocolo", value: data.protocol ?? "Não protocolado" },
    { label: "Valor", value: formatCurrency(data.value) },
    { label: "Situação financeira", value: FINANCIAL_STATUS[data.financial_status].label },
    { label: "Abertura", value: formatDate(data.opened_at) },
    { label: "Última atualização", value: relativeTime(data.last_movement_at) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <p className="field-label">Cliente</p>
              <h1 className="page-title mt-1 truncate">
                <Link
                  to="/clientes/$clientId"
                  params={{ clientId: data.client_id }}
                  className="rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {data.clients?.name}
                </Link>
              </h1>
              <p className="page-subtitle mt-1.5">
                {data.service_types?.name ?? data.title} · Responsável {data.owner_name}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={PROCESS_STAGE[data.stage].label} tone={PROCESS_STAGE[data.stage].tone} />
                <StatusBadge label={PRIORITY[data.priority].label} tone={PRIORITY[data.priority].tone} />
                <StatusBadge label={deadlineLabel} tone={deadlineTone} />
                <span className="text-sm text-muted-foreground">Prazo {formatDate(data.due_date)}</span>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{data.description}</p>
            </div>

            <div className="flex flex-col items-stretch gap-2 lg:w-60">
              <label htmlFor="stage-select" className="field-label">
                Etapa atual
              </label>
              <Select
                value={data.stage}
                onValueChange={(value) => {
                  moveDemoProcess(processId, value as ProcessStage);
                  notifyDemoSessionChange(`${data.code} agora está em ${PROCESS_STAGE[value as ProcessStage].label}.`);
                }}
              >
                <SelectTrigger id="stage-select" aria-label="Alterar etapa do processo" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>{PROCESS_STAGE[stage].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => notifyDemoAction("Registro de movimentação")}>
                Registrar movimentação
              </Button>
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {secondary.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="field-label">{item.label}</dt>
                <dd className="mt-1 truncate text-sm font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Progresso do fluxo</h2>
            <span className="text-sm text-muted-foreground">
              Etapa {currentIndex + 1} de {KANBAN_STAGES.length}
            </span>
          </div>
          <ol className="mt-4 flex flex-wrap gap-2">
            {KANBAN_STAGES.map((stage, index) => {
              const isCurrent = index === currentIndex;
              const isDone = index < currentIndex;
              const pending = isCurrent && (data.stage === "exigencia" || data.stage === "aguardando_documentos");
              return (
                <li
                  key={stage}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                    pending
                      ? "border-destructive/45 bg-destructive/10 font-semibold text-destructive"
                      : isDone
                        ? "border-success/40 bg-success/10 text-success"
                        : isCurrent
                          ? "border-brand bg-brand/10 font-semibold text-brand"
                          : "border-border text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  ) : (
                    <Circle className="size-3.5" aria-hidden />
                  )}
                  {PROCESS_STAGE[stage].short ?? PROCESS_STAGE[stage].label}
                  {pending && <span className="sr-only">etapa com pendência</span>}
                </li>
              );
            })}
          </ol>
          <p className="helper-text mt-3">
            Verde: etapa concluída · Azul: etapa atual · Vermelho: etapa com pendência · Cinza: etapa futura.
          </p>
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
                        <span className="truncate text-sm">{item.label}</span>
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
