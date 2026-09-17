import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  CalendarDays,
  History,
  LayoutGrid,
  List,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients, useProcesses } from "@/hooks/use-operations";
import { useTeamMembers } from "@/hooks/use-team";
import {
  useAddTaskComment,
  useArchiveTask,
  useChangeTaskStatus,
  useSaveTask,
  useTaskComments,
  useTaskHistory,
  useTaskList,
  type TaskFormValues,
  type TaskRow,
} from "@/hooks/use-tasks";
import {
  PRIORITY,
  TASK_BOARD_STATUSES,
  TASK_STATUS,
  type PriorityLevel,
  type TaskStatus,
} from "@/lib/domain";
import {
  filterTasks,
  groupTasksByStatus,
  nextTaskArchiveView,
  taskDateKey,
  taskIndicators,
  type TaskDeadlineFilter,
} from "@/lib/tasks";
import { describeError } from "@/lib/errors";
import { formatDate, formatDateOnly } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ActiveFilters } from "@/components/shared/active-filters";
import { clearRememberedFilters, useFilterMemory } from "@/hooks/use-filter-memory";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

export const Route = createFileRoute("/_authenticated/tarefas")({ component: TasksPage });
type View = "list" | "board" | "calendar";
const blank: TaskFormValues = {
  title: "",
  description: "",
  priority: "media",
  status: "pendente",
  due_at: "",
  assignee_id: "",
  assignee_name: "",
  client_id: "",
  process_id: "",
  document_id: "",
  monitoring_item_id: "",
};

const DISCARD_TASK_MESSAGE = "Esta tarefa possui alterações não salvas. Deseja descartá-las?";

function taskFormFingerprint(values: TaskFormValues) {
  return JSON.stringify({
    title: values.title ?? "",
    description: values.description ?? "",
    priority: values.priority,
    status: values.status ?? "pendente",
    due_at: values.due_at?.slice(0, 10) ?? "",
    assignee_id: values.assignee_id ?? "",
    client_id: values.client_id ?? "",
    process_id: values.process_id ?? "",
    document_id: values.document_id ?? "",
    monitoring_item_id: values.monitoring_item_id ?? "",
  });
}

function TasksPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const tasks = useTaskList(organizationId, undefined, true);
  const clients = useClients(organizationId);
  const processes = useProcesses(organizationId);
  const team = useTeamMembers(organizationId);
  const save = useSaveTask(organizationId);
  const changeStatus = useChangeTaskStatus(organizationId);
  const archive = useArchiveTask(organizationId);
  const [view, setView] = useState<View>("list");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<TaskStatus | "open" | "all">("open");
  const [priority, setPriority] = useState<PriorityLevel | "all">("all");
  const [assignee, setAssignee] = useState("all");
  const [deadline, setDeadline] = useState<TaskDeadlineFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  const [detail, setDetail] = useState<TaskRow | null>(null);
  const [form, setForm] = useState<TaskFormValues>(blank);
  const [initialForm, setInitialForm] = useState<TaskFormValues>(blank);
  const filterMemoryScope = `tasks:${organizationId ?? "none"}`;
  const rememberedFilters = useMemo(
    () => ({ view, term, status, priority, assignee, deadline, showArchived }),
    [view, term, status, priority, assignee, deadline, showArchived],
  );

  useFilterMemory(filterMemoryScope, rememberedFilters, (remembered) => {
    if (["list", "board", "calendar"].includes(String(remembered.view)))
      setView(remembered.view as View);
    if (typeof remembered.term === "string") setTerm(remembered.term);
    if (
      typeof remembered.status === "string" &&
      (["open", "all"].includes(remembered.status) || remembered.status in TASK_STATUS)
    )
      setStatus(remembered.status as TaskStatus | "open" | "all");
    if (
      typeof remembered.priority === "string" &&
      (remembered.priority === "all" || remembered.priority in PRIORITY)
    )
      setPriority(remembered.priority as PriorityLevel | "all");
    if (typeof remembered.assignee === "string") setAssignee(remembered.assignee);
    if (["all", "overdue", "today", "week", "without_due"].includes(String(remembered.deadline)))
      setDeadline(remembered.deadline as TaskDeadlineFilter);
    if (typeof remembered.showArchived === "boolean") setShowArchived(remembered.showArchived);
  });

  const rows = filterTasks(tasks.data ?? [], {
    term,
    status,
    priority,
    assignee,
    deadline,
    archived: showArchived,
  });
  const indicators = taskIndicators(tasks.data ?? []);
  const columns = groupTasksByStatus(rows);
  const owners = team.data ?? [];
  const assigneeNames = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...owners.map((member) => member.full_name ?? member.email),
            ...(tasks.data ?? []).map((task) => task.assignee_name),
          ].filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [owners, tasks.data],
  );
  const taskFormDirty =
    Boolean(editing) && taskFormFingerprint(form) !== taskFormFingerprint(initialForm);
  const markTaskSaved = useUnsavedChanges(taskFormDirty);
  const activeFilterCount = [
    term.trim().length > 0,
    status !== "open",
    priority !== "all",
    assignee !== "all",
    deadline !== "all",
    showArchived,
  ].filter(Boolean).length;

  const clearFilters = () => {
    clearRememberedFilters(filterMemoryScope);
    setTerm("");
    setStatus("open");
    setPriority("all");
    setAssignee("all");
    setDeadline("all");
    setShowArchived(false);
  };
  const toggleArchived = () => {
    const next = nextTaskArchiveView(showArchived);
    setShowArchived(next.archived);
    setStatus(next.status);
  };
  const openForm = (task?: TaskRow) => {
    const nextForm = task ? { ...task } : { ...blank };
    setEditing(task ?? "new");
    setForm(nextForm);
    setInitialForm(nextForm);
  };
  const closeForm = () => {
    if (taskFormDirty && !window.confirm(DISCARD_TASK_MESSAGE)) return;
    setEditing(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 3)
      return toast.error("Informe um título com pelo menos três caracteres.");
    try {
      await save.mutateAsync({
        id: editing === "new" ? undefined : editing?.id,
        values: { ...form, title: form.title.trim() },
      });
      markTaskSaved();
      toast.success(editing === "new" ? "Tarefa criada." : "Tarefa atualizada.");
      setEditing(null);
    } catch (error) {
      toast.error(describeError(error, "tarefa"));
    }
  };
  const updateStatus = async (task: TaskRow, next: TaskStatus) => {
    if (changeStatus.isPending) return;
    try {
      await changeStatus.mutateAsync({ task, status: next });
      toast.success(next === "concluida" ? "Tarefa concluída." : "Status atualizado.");
    } catch (error) {
      toast.error(describeError(error, "tarefa"));
    }
  };
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Tarefas</h1>
          <p className="page-subtitle">Lista, quadro e agenda operacional da sua organização.</p>
        </div>
        {permissions.canManageTasks && (
          <Button className="w-full sm:w-auto" onClick={() => openForm()}>
            <Plus className="mr-2 size-4" />
            Nova tarefa
          </Button>
        )}
      </header>
      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {[
          ["Em aberto", indicators.open],
          ["Atrasadas", indicators.overdue],
          ["Concluídas", indicators.completed],
          ["Arquivadas", indicators.archived],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-3 sm:p-4">
              <p className="field-label">{label}</p>
              <p className="metric-value mt-2">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <Tabs
          className="sm:col-span-2 lg:w-auto"
          value={view}
          onValueChange={(v) => setView(v as View)}
        >
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="list">
              <List className="mr-1.5 size-4" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="board">
              <LayoutGrid className="mr-1.5 size-4" />
              Quadro
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="mr-1.5 size-4" />
              Agenda
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Buscar tarefas"
          placeholder="Buscar tarefa, cliente, processo ou responsável"
          className="h-10 w-full lg:max-w-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger aria-label="Filtrar tarefas por status" className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Em aberto</SelectItem>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(TASK_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
          <SelectTrigger aria-label="Filtrar tarefas por prioridade" className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger aria-label="Filtrar tarefas por responsável" className="w-full lg:w-48">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            <SelectItem value="unassigned">Sem responsável</SelectItem>
            {assigneeNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={deadline}
          onValueChange={(value) => setDeadline(value as TaskDeadlineFilter)}
        >
          <SelectTrigger aria-label="Filtrar tarefas por prazo" className="w-full lg:w-44">
            <SelectValue placeholder="Prazo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer prazo</SelectItem>
            <SelectItem value="overdue">Atrasadas</SelectItem>
            <SelectItem value="today">Vencem hoje</SelectItem>
            <SelectItem value="week">Próximos 7 dias</SelectItem>
            <SelectItem value="without_due">Sem prazo</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="w-full sm:col-span-2 lg:w-auto"
          variant={showArchived ? "secondary" : "outline"}
          onClick={toggleArchived}
        >
          <Archive className="mr-2 size-4" />
          {showArchived ? "Arquivadas" : "Ver arquivadas"}
        </Button>
      </div>
      <ActiveFilters count={activeFilterCount} onClear={clearFilters} />
      {!tasks.isLoading && !tasks.isError && (
        <p className="helper-text" aria-live="polite">
          {rows.length} {rows.length === 1 ? "tarefa encontrada" : "tarefas encontradas"} com os
          filtros atuais.
        </p>
      )}
      {tasks.isLoading ? (
        <LoadingState label="Carregando tarefas" rows={5} />
      ) : tasks.isError ? (
        <ErrorState
          title="Não foi possível carregar as tarefas"
          description="Tente novamente para recuperar a lista, o quadro e a agenda."
          onRetry={() => void tasks.refetch()}
          retrying={tasks.isFetching}
        />
      ) : view === "board" ? (
        <div className="grid gap-3 lg:grid-cols-4">
          {TASK_BOARD_STATUSES.map((col) => (
            <Card key={col}>
              <CardContent className="p-3">
                <h2 className="mb-3 font-semibold">
                  {TASK_STATUS[col].label} <Badge variant="secondary">{columns[col].length}</Badge>
                </h2>
                <div className="space-y-2">
                  {columns[col].map((task) => (
                    <TaskCard key={task.id} task={task} onOpen={setDetail} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : view === "calendar" ? (
        <Agenda rows={rows} onOpen={setDetail} />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {rows.length ? (
              rows.map((task) => (
                <div
                  key={task.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4 sm:flex sm:flex-wrap sm:items-center"
                >
                  <input
                    className="mt-1 size-4 sm:mt-0"
                    type="checkbox"
                    aria-label={`Concluir ${task.title}`}
                    disabled={!permissions.canManageTasks || changeStatus.isPending}
                    checked={task.status === "concluida"}
                    onChange={(e) =>
                      updateStatus(task, e.target.checked ? "concluida" : "pendente")
                    }
                  />
                  <button className="min-w-0 text-left sm:flex-1" onClick={() => setDetail(task)}>
                    <span className="block truncate font-medium">{task.title}</span>
                    <span className="helper-text block truncate">
                      {task.clients?.name ?? "Sem cliente"} ·{" "}
                      {task.assignee_name ?? "Sem responsável"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground sm:hidden">
                      {formatDateOnly(task.due_at)}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <StatusBadge {...PRIORITY[task.priority]} />
                    {permissions.canManageTasks && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar"
                          disabled={save.isPending || archive.isPending}
                          onClick={() => openForm(task)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={task.archived_at ? "Restaurar" : "Arquivar"}
                          disabled={archive.isPending}
                          onClick={() => archive.mutate({ task, archived: !task.archived_at })}
                        >
                          {task.archived_at ? (
                            <RotateCcw className="size-4" />
                          ) : (
                            <Archive className="size-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                  <span className="hidden text-sm sm:inline">{formatDateOnly(task.due_at)}</span>
                </div>
              ))
            ) : (
              <p className="p-8 text-center text-muted-foreground">Nenhuma tarefa encontrada.</p>
            )}
          </CardContent>
        </Card>
      )}
      <TaskForm
        open={Boolean(editing)}
        onOpenChange={(o: boolean) => !o && closeForm()}
        form={form}
        setForm={setForm}
        onSubmit={submit}
        clients={clients.data ?? []}
        processes={processes.data ?? []}
        owners={owners}
        pending={save.isPending}
        dirty={taskFormDirty}
      />
      <TaskDetail
        task={detail}
        onClose={() => setDetail(null)}
        onStatus={updateStatus}
        statusPending={changeStatus.isPending}
      />
    </div>
  );
}
function TaskCard({ task, onOpen }: { task: TaskRow; onOpen: (t: TaskRow) => void }) {
  return (
    <button
      onClick={() => onOpen(task)}
      className="w-full rounded-lg border bg-background p-3 text-left hover:border-brand"
    >
      <p className="font-medium">{task.title}</p>
      <p className="helper-text mt-2">
        {formatDateOnly(task.due_at)} · {PRIORITY[task.priority].label}
      </p>
    </button>
  );
}
function Agenda({ rows, onOpen }: { rows: TaskRow[]; onOpen: (t: TaskRow) => void }) {
  const groups = rows
    .filter((t) => taskDateKey(t.due_at))
    .reduce((map, t) => {
      const key = taskDateKey(t.due_at)!;
      map.set(key, [...(map.get(key) ?? []), t]);
      return map;
    }, new Map<string, TaskRow[]>());
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        {[...groups.entries()].sort().map(([day, items]) => (
          <section key={day}>
            <h2 className="mb-2 font-semibold">{formatDateOnly(day)}</h2>
            {items.map((t) => (
              <button
                key={t.id}
                className="mb-2 block w-full rounded border p-3 text-left"
                onClick={() => onOpen(t)}
              >
                {t.due_time?.slice(0, 5) ?? "Dia todo"} · {t.title}
              </button>
            ))}
          </section>
        ))}
        {!groups.size && (
          <p className="text-muted-foreground">Nenhuma tarefa com prazo nesta seleção.</p>
        )}
      </CardContent>
    </Card>
  );
}
function TaskForm({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  clients,
  processes,
  owners,
  pending,
  dirty,
}: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{form.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
            {dirty && <Badge variant="secondary">Alterações não salvas</Badge>}
          </div>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <div className="sm:col-span-2">
            <Label>Título</Label>
            <Input
              value={form.title}
              maxLength={160}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <FieldSelect
            label="Status"
            value={form.status ?? "pendente"}
            entries={TASK_STATUS}
            onChange={(v: string) => setForm({ ...form, status: v })}
          />
          <FieldSelect
            label="Prioridade"
            value={form.priority}
            entries={PRIORITY}
            onChange={(v: string) => setForm({ ...form, priority: v })}
          />
          <div>
            <Label>Prazo</Label>
            <Input
              type="date"
              value={form.due_at?.slice(0, 10) ?? ""}
              onChange={(e) => setForm({ ...form, due_at: e.target.value })}
            />
          </div>
          <div>
            <Label>Responsável</Label>
            <Select
              value={form.assignee_id || "none"}
              onValueChange={(v) => {
                const m = owners.find((x: any) => x.user_id === v);
                setForm({
                  ...form,
                  assignee_id: v === "none" ? null : v,
                  assignee_name: m?.full_name ?? m?.email ?? null,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {owners.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name ?? m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Relation
            label="Cliente"
            value={form.client_id}
            items={clients.map((x: any) => ({ id: x.id, label: x.name }))}
            onChange={(v: string) => setForm({ ...form, client_id: v })}
          />
          <Relation
            label="Processo"
            value={form.process_id}
            items={processes.map((x: any) => ({ id: x.id, label: x.code }))}
            onChange={(v: string) => setForm({ ...form, process_id: v })}
          />
          <div>
            <Label>Documento (ID)</Label>
            <Input
              value={form.document_id ?? ""}
              onChange={(e) => setForm({ ...form, document_id: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Monitoramento (ID)</Label>
            <Input
              value={form.monitoring_item_id ?? ""}
              onChange={(e) => setForm({ ...form, monitoring_item_id: e.target.value || null })}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button className="w-full sm:w-auto" disabled={pending}>
              Salvar tarefa
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function FieldSelect({ label, value, entries, onChange }: any) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(entries).map(([k, v]: any) => (
            <SelectItem key={k} value={k}>
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Relation({ label, value, items, onChange }: any) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Sem vínculo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem vínculo</SelectItem>
          {items.map((x: any) => (
            <SelectItem key={x.id} value={x.id}>
              {x.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function TaskDetail({
  task,
  onClose,
  onStatus,
  statusPending,
}: {
  task: TaskRow | null;
  onClose: () => void;
  onStatus: (t: TaskRow, s: TaskStatus) => void;
  statusPending: boolean;
}) {
  const { organizationId } = useWorkspace();
  const comments = useTaskComments(task?.id ?? null);
  const history = useTaskHistory(task?.id ?? null);
  const add = useAddTaskComment(organizationId);
  const [comment, setComment] = useState("");
  return (
    <Dialog open={Boolean(task)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle>{task.title}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <StatusBadge {...TASK_STATUS[task.status]} />
              {TASK_BOARD_STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  disabled={statusPending}
                  onClick={() => onStatus(task, s)}
                >
                  {TASK_STATUS[s].label}
                </Button>
              ))}
            </div>
            <p className="text-sm">{task.description || "Sem descrição."}</p>
            {task.client_id && (
              <Link
                to="/clientes/$clientId"
                params={{ clientId: task.client_id }}
                className="text-sm text-brand"
              >
                Abrir cliente vinculado
              </Link>
            )}
            <section>
              <h3 className="mb-2 flex items-center font-semibold">
                <MessageSquare className="mr-2 size-4" />
                Comentários
              </h3>
              {comments.data?.map((c) => (
                <p key={c.id} className="mb-2 rounded border p-2 text-sm">
                  <b>{c.user_name ?? "Usuário"}</b>: {c.comment}
                </p>
              ))}
              <form
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  await add.mutateAsync({ taskId: task.id, comment: comment.trim() });
                  setComment("");
                }}
              >
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Adicionar comentário"
                />
                <Button className="w-full sm:w-auto">Enviar</Button>
              </form>
            </section>
            <section>
              <h3 className="mb-2 flex items-center font-semibold">
                <History className="mr-2 size-4" />
                Histórico
              </h3>
              {history.data?.map((h) => (
                <p key={h.id} className="text-sm text-muted-foreground">
                  {formatDate(h.created_at)} · {h.user_name ?? "Sistema"} · {h.action}
                </p>
              ))}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
