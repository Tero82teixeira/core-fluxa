import { civilDateKey } from "./format.ts";

export type PortalServiceCenterItem = {
  item_kind: "communication" | "document_request";
  item_id: string;
  client_id: string;
  client_name: string;
  title: string;
  status: string;
  priority: "baixa" | "normal" | "alta" | "urgente";
  assigned_to: string | null;
  due_date: string | null;
  last_activity_at: string;
  unread_count: number;
  opened_by_client: boolean;
  process_code: string | null;
  submitted_file_name: string | null;
  requires_action: boolean;
};

export type PortalServiceCenterFilters = {
  search: string;
  kind: "all" | PortalServiceCenterItem["item_kind"];
  queue: "all" | "action" | "unread" | "overdue";
  status: string;
  priority: "all" | PortalServiceCenterItem["priority"];
  assignee: string;
};

export function summarizePortalServiceCenter(
  items: readonly PortalServiceCenterItem[],
  today = civilDateKey(),
) {
  return {
    waitingTeam: items.filter(
      (item) => item.item_kind === "communication" && item.status === "aguardando_equipe",
    ).length,
    unread: items.reduce((total, item) => total + item.unread_count, 0),
    submitted: items.filter(
      (item) => item.item_kind === "document_request" && item.status === "submitted",
    ).length,
    overdue: items.filter(
      (item) =>
        item.item_kind === "document_request" &&
        Boolean(item.due_date && item.due_date < today),
    ).length,
  };
}

export function filterPortalServiceCenter(
  items: readonly PortalServiceCenterItem[],
  filters: PortalServiceCenterFilters,
  currentUserId: string | null,
  today = civilDateKey(),
) {
  const search = filters.search.trim().toLocaleLowerCase("pt-BR");
  return items.filter((item) => {
    if (
      search &&
      !`${item.client_name} ${item.title} ${item.process_code ?? ""} ${item.submitted_file_name ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(search)
    ) return false;
    if (filters.kind !== "all" && item.item_kind !== filters.kind) return false;
    if (filters.queue === "action" && !item.requires_action) return false;
    if (filters.queue === "unread" && item.unread_count === 0) return false;
    if (filters.queue === "overdue" && !(item.due_date && item.due_date < today)) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.priority !== "all" && item.priority !== filters.priority) return false;
    if (filters.assignee !== "all" && item.item_kind !== "communication") return false;
    if (filters.assignee === "mine" && item.assigned_to !== currentUserId) return false;
    if (filters.assignee === "unassigned" && item.assigned_to !== null) return false;
    if (
      !["all", "mine", "unassigned"].includes(filters.assignee) &&
      item.assigned_to !== filters.assignee
    ) return false;
    return true;
  });
}
