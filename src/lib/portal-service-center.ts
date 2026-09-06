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
  queue: "all" | "action" | "unread" | "overdue" | "sla_at_risk" | "sla_overdue";
  status: string;
  priority: "all" | PortalServiceCenterItem["priority"];
  assignee: string;
};

export const PORTAL_SERVICE_SLA_HOURS: Record<PortalServiceCenterItem["priority"], number> = {
  urgente: 2,
  alta: 4,
  normal: 24,
  baixa: 48,
};

export type PortalServiceSla = {
  state: "not_applicable" | "on_track" | "at_risk" | "overdue";
  limitHours: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  dueAt: string | null;
};

export function portalServiceSla(
  item: PortalServiceCenterItem,
  now = new Date(),
): PortalServiceSla {
  const limitHours = PORTAL_SERVICE_SLA_HOURS[item.priority];
  if (item.item_kind !== "communication" || item.status !== "aguardando_equipe") {
    return { state: "not_applicable", limitHours, elapsedMinutes: 0, remainingMinutes: 0, dueAt: null };
  }

  const startedAt = new Date(item.last_activity_at);
  if (Number.isNaN(startedAt.getTime())) {
    return { state: "not_applicable", limitHours, elapsedMinutes: 0, remainingMinutes: 0, dueAt: null };
  }

  const limitMinutes = limitHours * 60;
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));
  const remainingMinutes = limitMinutes - elapsedMinutes;
  const state = remainingMinutes <= 0
    ? "overdue"
    : elapsedMinutes >= limitMinutes * 0.75
      ? "at_risk"
      : "on_track";

  return {
    state,
    limitHours,
    elapsedMinutes,
    remainingMinutes,
    dueAt: new Date(startedAt.getTime() + limitMinutes * 60_000).toISOString(),
  };
}

export function formatServiceDuration(totalMinutes: number) {
  const minutes = Math.max(0, Math.abs(Math.round(totalMinutes)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function summarizePortalServiceCenter(
  items: readonly PortalServiceCenterItem[],
  today = civilDateKey(),
  now = new Date(),
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
    slaAtRisk: items.filter((item) => portalServiceSla(item, now).state === "at_risk").length,
    slaOverdue: items.filter((item) => portalServiceSla(item, now).state === "overdue").length,
  };
}

export function filterPortalServiceCenter(
  items: readonly PortalServiceCenterItem[],
  filters: PortalServiceCenterFilters,
  currentUserId: string | null,
  today = civilDateKey(),
  now = new Date(),
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
    if (filters.queue === "sla_at_risk" && portalServiceSla(item, now).state !== "at_risk") return false;
    if (filters.queue === "sla_overdue" && portalServiceSla(item, now).state !== "overdue") return false;
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

export function prioritizePortalServiceCenter(
  items: readonly PortalServiceCenterItem[],
  now = new Date(),
) {
  const rank = (item: PortalServiceCenterItem) => {
    const sla = portalServiceSla(item, now).state;
    if (sla === "overdue") return 0;
    if (sla === "at_risk") return 1;
    if (item.requires_action) return 2;
    if (item.unread_count > 0) return 3;
    return 4;
  };
  return [...items].sort((left, right) =>
    rank(left) - rank(right) ||
    right.last_activity_at.localeCompare(left.last_activity_at) ||
    left.item_id.localeCompare(right.item_id),
  );
}
