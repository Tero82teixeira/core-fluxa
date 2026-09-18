import {
  TASK_BOARD_STATUSES,
  TASK_OPEN_STATUSES,
  type PriorityLevel,
  type TaskStatus,
} from "./domain.ts";

export type TaskSummary = {
  title?: string | null;
  description?: string | null;
  status: TaskStatus;
  priority: PriorityLevel;
  due_at: string | null;
  archived_at?: string | null;
  assignee_name?: string | null;
  clients?: { name?: string | null } | null;
  processes?: { code?: string | null } | null;
};

export type TaskDeadlineFilter = "all" | "overdue" | "today" | "week" | "without_due";

export const isTaskOpen = (status: TaskStatus) => TASK_OPEN_STATUSES.includes(status);
export const isTaskArchived = (task: TaskSummary) =>
  Boolean(task.archived_at) || task.status === "arquivada";

/** Mantém o atalho de arquivadas coerente com o filtro de status da tela. */
export function nextTaskArchiveView(showArchived: boolean) {
  const archived = !showArchived;
  return {
    archived,
    status: archived ? ("all" as const) : ("open" as const),
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
  const due = taskDateKey(task.due_at);
  const today = taskDateKey(now.toISOString());
  return isTaskOpen(task.status) && due !== null && today !== null && due < today;
}

export function taskDateKey(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function filterTasks<T extends TaskSummary>(
  tasks: T[],
  filters: {
    term?: string;
    status?: TaskStatus | "open" | "all";
    priority?: PriorityLevel | "all";
    assignee?: string | "all";
    deadline?: TaskDeadlineFilter;
    archived?: boolean;
  },
  now = new Date(),
) {
  const needle = normalizeTaskSearch(filters.term ?? "");
  const today = taskDateKey(now.toISOString())!;
  const weekEnd = new Date(`${today}T00:00:00.000Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndKey = taskDateKey(weekEnd.toISOString())!;

  return tasks.filter((task) => {
    if (filters.archived !== undefined && isTaskArchived(task) !== filters.archived) return false;
    if (filters.status && filters.status !== "all") {
      if (filters.status === "open" ? !isTaskOpen(task.status) : task.status !== filters.status)
        return false;
    }
    if (filters.priority && filters.priority !== "all" && task.priority !== filters.priority)
      return false;
    if (filters.assignee === "unassigned" && task.assignee_name) return false;
    if (
      filters.assignee &&
      !["all", "unassigned"].includes(filters.assignee) &&
      task.assignee_name !== filters.assignee
    )
      return false;

    const due = taskDateKey(task.due_at);
    if (filters.deadline === "overdue" && !isTaskOverdue(task, now)) return false;
    if (filters.deadline === "today" && due !== today) return false;
    if (filters.deadline === "week" && (!due || due < today || due > weekEndKey)) return false;
    if (filters.deadline === "without_due" && due !== null) return false;

    if (!needle) return true;
    const haystack = normalizeTaskSearch(
      [task.title, task.description, task.assignee_name, task.clients?.name, task.processes?.code]
        .filter(Boolean)
        .join(" "),
    );
    return haystack.includes(needle);
  });
}

function normalizeTaskSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
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
  return Object.fromEntries(
    TASK_BOARD_STATUSES.map((status) => [status, tasks.filter((task) => task.status === status)]),
  ) as Record<TaskStatus, T[]>;
}
