import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useProcess, useProcessChecklist, useProcessMovements, useTasks } from "@/hooks/use-operations";
import { useWorkspace } from "@/lib/workspace";
import {
  useAddProcessNote,
  useCreateChecklistItem,
  useCreateTask,
  useMoveProcessStage,
  useSetTaskStatus,
  useUpdateChecklistItem,
  type ChecklistStatus,
} from "@/hooks/use-mutations";
import { usePermissions } from "@/lib/permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/errors";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentScopePanel } from "@/components/documents/document-scope-panel";
import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FINANCIAL_STATUS,
  KANBAN_STAGES,
  PRIORITY,
  PROCESS_STAGE,
  TASK_STATUS,
  type ProcessStage,
} from "@/lib/domain";
import { daysUntil, formatCurrency, formatDate, relativeTime } from "@/lib/format";

const CHECKLIST_LABEL: Record<string, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

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
  const permissions = usePermissions();
  const process = useProcess(processId);
  const checklist = useProcessChecklist(processId);
  const createChecklistItem = useCreateChecklistItem(organizationId, processId);
  const updateChecklistItem = useUpdateChecklistItem(organizationId, processId);
  const [newDoc, setNewDoc] = useState("");
  const moveStage = useMoveProcessStage(organizationId);
  const addNote = useAddProcessNote(organizationId);
  const createTask = useCreateTask(organizationId);
  const setTaskStatus = useSetTaskStatus(organizationId);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const movements = useProcessMovements(processId);
  const tasks = useTasks(organizationId);

  if (process.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!process.data) {
    return <p className="p-6 text-sm text-muted-foreground">Processo não encontrado nesta empresa.</p>;
  }

  const data = process.data;
  const days = daysUntil(data.due_date);
  const deadlineLabel =
    days === null ? "Sem prazo" : days < 0 ? `Atrasado ${Math.abs(days)} dia(s)` : days === 0 ? "Vence hoje" : `Faltam ${days} dia(s)`;
  const deadlineTone = days === null ? "neutral" : days < 0 ? "danger" : days <= 2 ? "warning" : "success";
  const checklistItems = checklist.data ?? [];
  const checklistDone = checklistItems.filter((item) => item.status === "aprovado" || item.status === "recebido").length;
  const docsTotal = checklistItems.length || data.documents_total;
  const docsReceived = checklistItems.length ? checklistDone : data.documents_received;
  const docsPct = docsTotal ? Math.round((docsReceived / docsTotal) * 100) : 0;
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
                onValueChange={async (value) => {
                  const to = value as ProcessStage;
                  if (to === data.stage) return;
                  try {
                    await moveStage.mutateAsync({ processId, from: data.stage, to, code: data.code });
                    toast.success(`${data.code} agora está em ${PROCESS_STAGE[to].label}.`);
                  } catch (error) {
                    toast.error(describeError(error, "etapa"));
                  }
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
              <Button variant="outline" onClick={() => setNoteOpen((open) => !open)}>
                Registrar movimentação
              </Button>
              {noteOpen && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    maxLength={400}
                    value={note}
                    aria-label="Descrição da movimentação"
                    placeholder="Descreva o que aconteceu neste processo"
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={addNote.isPending || note.trim().length < 3}
                    onClick={async () => {
                      try {
                        await addNote.mutateAsync({ processId, description: note.trim() });
                        setNote("");
                        setNoteOpen(false);
                        toast.success("Movimentação registrada.");
                      } catch (error) {
                        toast.error(describeError(error, "processo"));
                      }
                    }}
                  >
                    {addNote.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Salvar movimentação
                  </Button>
                </div>
              )}
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
          <TabsList className="h-auto flex-wrap gap-1.5 p-1.5">
            <TabsTrigger value="timeline" className="px-4 py-2 text-sm">Linha do tempo</TabsTrigger>
            <TabsTrigger value="documentos" className="px-4 py-2 text-sm">Checklist ({checklistItems.length})</TabsTrigger>
            <TabsTrigger value="arquivos" className="px-4 py-2 text-sm">Documentos</TabsTrigger>
            <TabsTrigger value="tarefas" className="px-4 py-2 text-sm">Tarefas ({relatedTasks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="arquivos">
            <DocumentScopePanel
              processId={processId}
              emptyDescription="Anexe os arquivos deste processo — eles também aparecem na ficha do cliente."
            />
          </TabsContent>



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
                  <span className="card-title">Checklist operacional</span>
                  <span className="text-muted-foreground">{docsReceived}/{docsTotal} concluídos</span>
                </div>
                <Progress value={docsPct} className="mt-3 h-1.5" />

                {permissions.canEdit && (
                  <form
                    className="mt-5 flex flex-wrap gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (newDoc.trim().length < 3) return;
                      try {
                        await createChecklistItem.mutateAsync({
                          title: newDoc.trim(),
                          status: "pendente",
                          required: true,
                          position: checklistItems.length,
                        });
                        setNewDoc("");
                        toast.success("Item adicionado ao checklist.");
                      } catch (error) {
                        toast.error(describeError(error, "checklist"));
                      }
                    }}
                  >
                    <Input
                      value={newDoc}
                      onChange={(event) => setNewDoc(event.target.value)}
                      aria-label="Novo item do checklist"
                      placeholder="Ex.: Contrato social atualizado"
                      maxLength={160}
                      className="h-10 min-w-0 flex-1"
                    />
                    <Button type="submit" disabled={createChecklistItem.isPending}>
                      <Plus className="size-4" aria-hidden /> Adicionar
                    </Button>
                  </form>
                )}

                <ul className="mt-5 space-y-3">
                  {checklistItems.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="helper-text mt-0.5">
                          {item.required ? "Obrigatório" : "Opcional"}
                          {item.due_date ? ` · Prazo ${formatDate(item.due_date)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={item.status}
                          disabled={!permissions.canEdit || updateChecklistItem.isPending}
                          onValueChange={async (value) => {
                            const status = value as ChecklistStatus;
                            if (status === item.status) return;
                            try {
                              await updateChecklistItem.mutateAsync({
                                id: item.id,
                                values: { status },
                                movement: `Checklist "${item.title}": ${CHECKLIST_LABEL[status]}.`,
                              });
                            } catch (error) {
                              toast.error(describeError(error, "checklist"));
                            }
                          }}
                        >
                          <SelectTrigger className="h-9 w-44" aria-label={`Status do item ${item.title}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CHECKLIST_LABEL).map(([key, label]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {permissions.canUploadDocuments && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAttachItem({ id: item.id, title: item.title })}
                          >
                            Anexar
                          </Button>
                        )}
                        {permissions.canEdit && (

                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover ${item.title}`}
                            onClick={async () => {
                              try {
                                await updateChecklistItem.mutateAsync({
                                  id: item.id,
                                  values: { deleted_at: new Date().toISOString() },
                                  movement: `Item de checklist removido: ${item.title}.`,
                                });
                                toast.success("Item removido.");
                              } catch (error) {
                                toast.error(describeError(error, "checklist"));
                              }
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  {checklistItems.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Nenhum item no checklist deste processo.
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tarefas">
            <Card>
              <CardContent className="p-6">
                <form
                  className="mb-4 flex flex-wrap gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (newTask.trim().length < 3) return;
                    try {
                      await createTask.mutateAsync({
                        title: newTask.trim(),
                        priority: data.priority,
                        process_id: processId,
                        client_id: data.client_id,
                      });
                      setNewTask("");
                      toast.success("Tarefa criada.");
                    } catch (error) {
                      toast.error(describeError(error, "tarefa"));
                    }
                  }}
                >
                  <Input
                    value={newTask}
                    onChange={(event) => setNewTask(event.target.value)}
                    aria-label="Nova tarefa do processo"
                    placeholder="Nova tarefa deste processo"
                    maxLength={160}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button type="submit" disabled={createTask.isPending}>
                    <Plus className="size-4" aria-hidden /> Adicionar
                  </Button>
                </form>
                <ul className="space-y-3">
                  {relatedTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3">
                      <label className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--brand)]"
                          checked={task.status === "concluida"}
                          onChange={async (event) => {
                            try {
                              await setTaskStatus.mutateAsync({
                                id: task.id,
                                status: event.target.checked ? "concluida" : "pendente",
                                title: task.title,
                                processId,
                              });
                            } catch (error) {
                              toast.error(describeError(error, "tarefa"));
                            }
                          }}
                        />
                        <span className="min-w-0">
                          <span className={`block truncate text-sm font-medium ${task.status === "concluida" ? "text-muted-foreground line-through" : ""}`}>
                            {task.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(task.due_at)} · {task.assignee_name}
                          </span>
                        </span>
                      </label>
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
              <h2 className="section-title">Resumo</h2>
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
              <h2 className="section-title">Próxima ação sugerida</h2>
              <p className="mt-2 text-sm text-muted-foreground">{data.description ?? "—"}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
