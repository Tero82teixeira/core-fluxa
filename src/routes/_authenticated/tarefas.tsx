import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients, useProcesses, useTasks } from "@/hooks/use-operations";
import { useCreateTask, useDeleteTask, useSetTaskStatus } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import { PRIORITY, TASK_STATUS, type PriorityLevel } from "@/lib/domain";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { daysUntil, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — FLUXA" },
      { name: "description", content: "Agenda operacional da equipe com responsáveis, prazos e vínculos." },
      { property: "og:title", content: "Tarefas — FLUXA" },
      { property: "og:description", content: "Agenda operacional da equipe com responsáveis, prazos e vínculos." },
    ],
  }),
  component: TasksPage,
});

const emptyTask = {
  title: "",
  priority: "media" as PriorityLevel,
  due_at: "",
  client_id: "",
  process_id: "",
};

function TasksPage() {
  const { organizationId, displayName } = useWorkspace();
  const permissions = usePermissions();
  const tasks = useTasks(organizationId);
  const clients = useClients(organizationId);
  const processes = useProcesses(organizationId);
  const createTask = useCreateTask(organizationId);
  const setStatus = useSetTaskStatus(organizationId);
  const deleteTask = useDeleteTask(organizationId);

  const [form, setForm] = useState(emptyTask);
  const [status, setStatusFilter] = useState("abertas");
  const [priority, setPriority] = useState("todos");
  const [owner, setOwner] = useState("todos");

  const all = tasks.data ?? [];
  const owners = useMemo(
    () => Array.from(new Set(all.map((task) => task.assignee_name).filter(Boolean) as string[])).sort(),
    [all],
  );
  const processById = useMemo(
    () => new Map((processes.data ?? []).map((process) => [process.id, process])),
    [processes.data],
  );

  const rows = useMemo(
    () =>
      all.filter((task) => {
        const matchStatus =
          status === "todos" ||
          (status === "abertas" ? task.status !== "concluida" && task.status !== "cancelada" : task.status === status);
        return (
          matchStatus &&
          (priority === "todos" || task.priority === priority) &&
          (owner === "todos" || task.assignee_name === owner)
        );
      }),
    [all, status, priority, owner],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 3) {
      toast.error("Descreva a tarefa com pelo menos três caracteres.");
      return;
    }
    try {
      const process = form.process_id ? processById.get(form.process_id) : undefined;
      await createTask.mutateAsync({
        title: form.title.trim(),
        priority: form.priority,
        due_at: form.due_at ? new Date(`${form.due_at}T12:00:00`).toISOString() : null,
        client_id: form.client_id || process?.client_id || null,
        process_id: form.process_id || null,
        assignee_name: displayName,
      });
      setForm(emptyTask);
      toast.success("Tarefa criada.");
    } catch (error) {
      toast.error(describeError(error, "tarefa"));
    }
  };

  const pending = all.filter((task) => task.status !== "concluida" && task.status !== "cancelada");
  const late = pending.filter((task) => {
    const days = daysUntil(task.due_at);
    return days !== null && days < 0;
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Tarefas</h1>
        <p className="page-subtitle">Agenda operacional vinculada a clientes e processos.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Em aberto", value: pending.length },
          { label: "Atrasadas", value: late.length },
          { label: "Concluídas", value: all.filter((task) => task.status === "concluida").length },
          { label: "Total", value: all.length },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4 sm:p-5">
              <p className="field-label">{item.label}</p>
              <p className="metric-value mt-2 text-2xl">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {permissions.canManageTasks && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="section-title">Nova tarefa</h2>
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="task-title">Tarefa</Label>
                <Input
                  id="task-title"
                  maxLength={160}
                  value={form.title}
                  placeholder="Ex.: Solicitar documentação complementar"
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm({ ...form, priority: value as PriorityLevel })}
                >
                  <SelectTrigger className="h-10" aria-label="Prioridade da tarefa">
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
                <Label htmlFor="task-due">Prazo</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.due_at}
                  onChange={(event) => setForm({ ...form, due_at: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cliente</Label>
                <Select
                  value={form.client_id || "none"}
                  onValueChange={(value) => setForm({ ...form, client_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger className="h-10" aria-label="Cliente vinculado">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {(clients.data ?? []).map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Processo</Label>
                <Select
                  value={form.process_id || "none"}
                  onValueChange={(value) => setForm({ ...form, process_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger className="h-10" aria-label="Processo vinculado">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {(processes.data ?? []).map((process) => (
                      <SelectItem key={process.id} value={process.id}>
                        {process.code} · {process.clients?.name ?? "Cliente"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-4">
                <Button type="submit" disabled={createTask.isPending}>
                  {createTask.isPending ? "Criando…" : "Criar tarefa"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <Select value={status} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filtrar por status" className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em aberto</SelectItem>
            <SelectItem value="todos">Todas</SelectItem>
            {Object.entries(TASK_STATUS).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger aria-label="Filtrar por prioridade" className="h-10 w-full sm:w-44">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas prioridades</SelectItem>
            {Object.entries(PRIORITY).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger aria-label="Filtrar por responsável" className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {owners.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tasks.isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ListChecks}
              title="Nenhuma tarefa encontrada"
              description="Crie uma tarefa ou ajuste os filtros para ver outros períodos."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((task) => {
                const process = task.process_id ? processById.get(task.process_id) : undefined;
                const days = daysUntil(task.due_at);
                const overdue = days !== null && days < 0 && task.status !== "concluida";
                return (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <label className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--brand)]"
                        aria-label={`Concluir ${task.title}`}
                        disabled={!permissions.canManageTasks}
                        checked={task.status === "concluida"}
                        onChange={async (event) => {
                          try {
                            await setStatus.mutateAsync({
                              id: task.id,
                              status: event.target.checked ? "concluida" : "pendente",
                              title: task.title,
                              processId: task.process_id,
                            });
                          } catch (error) {
                            toast.error(describeError(error, "tarefa"));
                          }
                        }}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block truncate text-sm font-medium ${
                            task.status === "concluida" ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className="helper-text mt-0.5 block truncate">
                          {task.clients?.name ?? "Sem cliente"}
                          {process ? " · " : ""}
                          {process && (
                            <Link
                              to="/processos/$processId"
                              params={{ processId: process.id }}
                              className="underline-offset-4 hover:underline"
                            >
                              {process.code}
                            </Link>
                          )}
                          {" · "}
                          {task.due_at ? `Prazo ${formatDate(task.due_at)}` : "Sem prazo"}
                          {" · "}
                          {task.assignee_name ?? "Sem responsável"}
                        </span>
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-2">
                      {overdue && <StatusBadge label="Atrasada" tone="danger" />}
                      <StatusBadge label={PRIORITY[task.priority].label} tone={PRIORITY[task.priority].tone} />
                      <StatusBadge label={TASK_STATUS[task.status].label} tone={TASK_STATUS[task.status].tone} />
                      {permissions.canManageTasks && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${task.title}`}
                          onClick={async () => {
                            try {
                              await deleteTask.mutateAsync(task.id);
                              toast.success("Tarefa removida.");
                            } catch (error) {
                              toast.error(describeError(error, "tarefa"));
                            }
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
