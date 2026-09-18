import { TASK_BOARD_STATUSES, TASK_OPEN_STATUSES, type PriorityLevel, type TaskStatus } from "./domain.ts";

export type TaskSummary = {
  status: TaskStatus;
  priority: PriorityLevel;
  due_at: string | null;
  archived_at?: string | null;
  assignee_name?: string | null;
};

export const isTaskOpen = (status: TaskStatus) => TASK_OPEN_STATUSES.includes(status);
export const isTaskArchived = (task: TaskSummary) => Boolean(task.archived_at) || task.status === "arquivada";

/** Mantém o atalho de arquivadas coerente com o filtro de status da tela. */
export function nextTaskArchiveView(showArchived: boolean) {
  const archived = !showArchived;
  return {
    archived,
    status: archived ? "all" as const : "open" as const,
  };
}

export type TaskStatusUpdate = {
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
};

/**
 * Monta os campos derivados de uma mudança de status.
 * Um status ausente preserva todos os campos para compatibilidade com edições legadas.
 */
export function buildTaskStatusUpdate(
  status: TaskStatus | undefined,
  actorId: string | null,
  completedAt = new Date().toISOString(),
): TaskStatusUpdate | Record<string, never> {
  if (status === undefined) return {};
  const completed = status === "concluida";
  return {
    status,
    completed_at: completed ? completedAt : null,
    completed_by: completed ? actorId : null,
  };
}

export function isTaskOverdue(task: TaskSummary, now = new Date()) {
  return isTaskOpen(task.status) && Boolean(task.due_at) && new Date(task.due_at!).getTime() < now.getTime();
}

export function taskDateKey(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function filterTasks<T extends TaskSummary>(
  tasks: T[],
  filters: { status?: TaskStatus | "open" | "all"; priority?: PriorityLevel | "all"; assignee?: string | "all"; archived?: boolean },
) {
  return tasks.filter((task) => {
    if (filters.archived !== undefined && isTaskArchived(task) !== filters.archived) return false;
    if (filters.status && filters.status !== "all") {
      if (filters.status === "open" ? !isTaskOpen(task.status) : task.status !== filters.status) return false;
    }
    if (filters.priority && filters.priority !== "all" && task.priority !== filters.priority) return false;
    return !filters.assignee || filters.assignee === "all" || task.assignee_name === filters.assignee;
  });
}

export function taskIndicators(tasks: TaskSummary[], now = new Date()) {
  const active = tasks.filter((task) => !isTaskArchived(task));
  return {
    open: active.filter((task) => isTaskOpen(task.status)).length,
    overdue: active.filter((task) => isTaskOverdue(task, now)).length,
    completed: active.filter((task) => task.status === "concluida").length,
    archived: tasks.filter(isTaskArchived).length,
  };
}

export function groupTasksByStatus<T extends TaskSummary>(tasks: T[]) {
  return Object.fromEntries(TASK_BOARD_STATUSES.map((status) => [status, tasks.filter((task) => task.status === status)])) as Record<TaskStatus, T[]>;
}
