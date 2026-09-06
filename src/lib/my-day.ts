import type { CommunicationThread } from "@/hooks/use-communication";
import type { TaskRow } from "@/hooks/use-operations";
import type { PortalServiceCenterItem } from "./portal-service-center.ts";
import { portalServiceSla } from "./portal-service-center.ts";
import { civilDateKey } from "./format.ts";
import { isTaskOpen } from "./tasks.ts";

export type MyDayItem = {
  id: string;
  kind: "task" | "communication" | "triage" | "document";
  title: string;
  context: string;
  deadline: string | null;
  href: "/tarefas" | "/comunicacao";
  urgency: "overdue" | "today" | "attention" | "normal";
  rank: number;
};

type MyDayInput = {
  tasks: readonly TaskRow[];
  communications: readonly CommunicationThread[];
  portalItems: readonly PortalServiceCenterItem[];
  userId: string | null;
  canReviewDocuments: boolean;
  now?: Date;
};

const activeCommunication = (row: CommunicationThread) =>
  !row.archived_at && !["resolvida", "arquivada"].includes(row.status);

const urgencyForDate = (value: string | null, today: string) => {
  if (!value) return "normal" as const;
  const key = value.slice(0, 10);
  if (key < today) return "overdue" as const;
  if (key === today) return "today" as const;
  return "normal" as const;
};

/** Monta uma fila pessoal curta, determinística e sem criar outra fonte de dados. */
export function buildMyDay(input: MyDayInput) {
  const now = input.now ?? new Date();
  const today = civilDateKey(now);
  const assignedTasks = input.tasks.filter(
    (task) => isTaskOpen(task.status) && task.assignee_id === input.userId,
  );
  const assignedCommunications = input.communications.filter(
    (row) => activeCommunication(row) && row.assigned_to === input.userId,
  );
  const triage = input.portalItems.filter(
    (item) =>
      item.item_kind === "communication" &&
      item.assigned_to === null &&
      !["resolvida", "arquivada"].includes(item.status),
  );
  const documents = input.canReviewDocuments
    ? input.portalItems.filter(
        (item) => item.item_kind === "document_request" && item.status === "submitted",
      )
    : [];

  const items: MyDayItem[] = [
    ...assignedTasks.map((task): MyDayItem => {
      const urgency = urgencyForDate(task.due_at, today);
      return {
        id: `task:${task.id}`,
        kind: "task",
        title: task.title,
        context: task.clients?.name ?? "Tarefa atribuída a você",
        deadline: task.due_at,
        href: "/tarefas",
        urgency,
        rank: urgency === "overdue" ? 0 : urgency === "today" ? 2 : 6,
      };
    }),
    ...assignedCommunications.map((row): MyDayItem => {
      const urgency = urgencyForDate(row.follow_up_at, today);
      const waiting = row.status === "aguardando_equipe";
      return {
        id: `communication:${row.id}`,
        kind: "communication",
        title: row.subject,
        context: row.clients?.name ?? "Atendimento atribuído a você",
        deadline: row.follow_up_at,
        href: "/comunicacao",
        urgency: urgency === "normal" && waiting ? "attention" : urgency,
        rank: urgency === "overdue" ? 0 : urgency === "today" ? 2 : waiting ? 3 : 7,
      };
    }),
    ...triage.map((item): MyDayItem => {
      const sla = portalServiceSla(item, now).state;
      return {
        id: `triage:${item.item_id}`,
        kind: "triage",
        title: item.title,
        context: `${item.client_name} · sem responsável`,
        deadline: portalServiceSla(item, now).dueAt,
        href: "/comunicacao",
        urgency: sla === "overdue" ? "overdue" : sla === "at_risk" ? "attention" : "normal",
        rank: sla === "overdue" ? 0 : sla === "at_risk" ? 1 : 4,
      };
    }),
    ...documents.map((item): MyDayItem => ({
      id: `document:${item.item_id}`,
      kind: "document",
      title: item.title,
      context: `${item.client_name} · documento enviado`,
      deadline: item.due_date,
      href: "/comunicacao",
      urgency: urgencyForDate(item.due_date, today),
      rank: urgencyForDate(item.due_date, today) === "overdue" ? 0 : 3,
    })),
  ].sort(
    (left, right) =>
      left.rank - right.rank ||
      String(left.deadline ?? "9999").localeCompare(String(right.deadline ?? "9999")) ||
      left.title.localeCompare(right.title, "pt-BR"),
  );

  return {
    items,
    summary: {
      overdue: items.filter((item) => item.urgency === "overdue").length,
      today: items.filter((item) => item.urgency === "today").length,
      assignedTasks: assignedTasks.length,
      assignedCommunications: assignedCommunications.length,
      triage: triage.length,
      documents: documents.length,
    },
  };
}
