import type { ProcessRow, TaskRow } from "@/hooks/use-operations";
import { PROCESS_STAGE } from "@/lib/domain";

const CLOSED_PROCESS_STAGES = new Set(["finalizado", "arquivado", "cancelado"]);
const OPEN_TASK_STATUSES = new Set(["pendente", "em_andamento", "aguardando"]);

function civilTime(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).getTime();
}

function dayDistance(today: string, value: string) {
  return Math.round((civilTime(value) - civilTime(today)) / 86_400_000);
}

export function localCivilDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function summarizeLegalWorkspace({
  processes,
  tasks,
  today,
}: {
  processes: ProcessRow[];
  tasks: TaskRow[];
  today: string;
}) {
  const activeProcesses = processes.filter((process) => !CLOSED_PROCESS_STAGES.has(process.stage));
  const openTasks = tasks.filter((task) => OPEN_TASK_STATUSES.has(task.status));

  const overdueProcesses = activeProcesses.filter(
    (process) => process.due_date && dayDistance(today, process.due_date) < 0,
  );
  const dueToday = activeProcesses.filter(
    (process) => process.due_date && dayDistance(today, process.due_date) === 0,
  );
  const dueNextSevenDays = activeProcesses.filter((process) => {
    if (!process.due_date) return false;
    const days = dayDistance(today, process.due_date);
    return days > 0 && days <= 7;
  });

  const urgentProcesses = [...overdueProcesses, ...dueToday, ...dueNextSevenDays].sort((a, b) =>
    String(a.due_date).localeCompare(String(b.due_date)),
  );

  const urgentTasks = openTasks
    .filter((task) => task.due_at && dayDistance(today, task.due_at) <= 7)
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));

  const stageCounts = Object.entries(PROCESS_STAGE)
    .map(([key, definition]) => ({
      key,
      label: definition.short,
      count: activeProcesses.filter((process) => process.stage === key).length,
    }))
    .filter((stage) => stage.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    activeProcesses,
    openTasks,
    overdueProcesses,
    dueToday,
    dueNextSevenDays,
    urgentProcesses,
    urgentTasks,
    stageCounts,
    inRequirement: activeProcesses.filter((process) => process.stage === "exigencia"),
    withoutOwner: activeProcesses.filter((process) => !process.owner_name?.trim()),
    critical: activeProcesses.filter((process) => process.priority === "critica"),
  };
}
