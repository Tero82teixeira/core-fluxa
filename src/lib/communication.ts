export const COMMUNICATION_STATUSES = ["aberta", "aguardando_cliente", "aguardando_equipe", "resolvida", "arquivada"] as const;
export const COMMUNICATION_PRIORITIES = ["baixa", "normal", "alta", "urgente"] as const;
export const COMMUNICATION_CHANNELS = ["whatsapp", "telefone", "email", "presencial", "interno", "outro"] as const;
export const COMMUNICATION_ENTRY_TYPES = ["mensagem", "nota_interna", "ligacao", "email", "whatsapp", "reuniao", "outro", "status", "lembrete", "anexo"] as const;

export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];
export type CommunicationPriority = (typeof COMMUNICATION_PRIORITIES)[number];
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];
export type CommunicationEntryType = (typeof COMMUNICATION_ENTRY_TYPES)[number];

export type CommunicationSummary = {
  status: CommunicationStatus;
  priority: CommunicationPriority;
  channel: CommunicationChannel;
  follow_up_at: string | null;
  archived_at: string | null;
  updated_at: string;
  subject: string;
  client_name: string;
  assigned_name?: string | null;
  searchable_content?: string | null;
};

export type FollowUpState = "none" | "today" | "overdue" | "future";

export function followUpState(value: string | null, now = new Date()): FollowUpState {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "none";
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (day(date) === day(now)) return "today";
  return date.getTime() < now.getTime() ? "overdue" : "future";
}

export function communicationIndicators(rows: readonly CommunicationSummary[], now = new Date()) {
  return {
    open: rows.filter((row) => row.status === "aberta").length,
    waitingClient: rows.filter((row) => row.status === "aguardando_cliente").length,
    waitingTeam: rows.filter((row) => row.status === "aguardando_equipe").length,
    overdue: rows.filter((row) => row.status !== "resolvida" && row.status !== "arquivada" && followUpState(row.follow_up_at, now) === "overdue").length,
    resolved: rows.filter((row) => row.status === "resolvida").length,
  };
}

export type CommunicationFilters = {
  search?: string;
  client?: string;
  assignee?: string;
  status?: CommunicationStatus | "all";
  priority?: CommunicationPriority | "all";
  channel?: CommunicationChannel | "all";
  followUp?: FollowUpState | "all";
  from?: string;
  to?: string;
};

export function filterCommunication<T extends CommunicationSummary>(rows: readonly T[], filters: CommunicationFilters, now = new Date()): T[] {
  const term = filters.search?.trim().toLocaleLowerCase("pt-BR");
  return rows.filter((row) => {
    if (term && !`${row.client_name} ${row.subject} ${row.searchable_content ?? ""}`.toLocaleLowerCase("pt-BR").includes(term)) return false;
    if (filters.client && filters.client !== "all" && row.client_name !== filters.client) return false;
    if (filters.assignee && filters.assignee !== "all" && row.assigned_name !== filters.assignee) return false;
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.priority && filters.priority !== "all" && row.priority !== filters.priority) return false;
    if (filters.channel && filters.channel !== "all" && row.channel !== filters.channel) return false;
    if (filters.followUp && filters.followUp !== "all" && followUpState(row.follow_up_at, now) !== filters.followUp) return false;
    if (filters.from && row.updated_at < filters.from) return false;
    if (filters.to && row.updated_at.slice(0, 10) > filters.to) return false;
    return true;
  });
}

export function syncCommunicationSelection<T extends { id: string }>(selectedId: string | null, rows: readonly T[]): string | null {
  if (!selectedId) return null;
  return rows.some((row) => row.id === selectedId) ? selectedId : null;
}

export function isCommunicationReadOnly(thread: Pick<CommunicationSummary, "status" | "archived_at">) {
  return thread.status === "arquivada" || Boolean(thread.archived_at);
}

export function canWriteCommunication(role: string | null) {
  return ["superadmin", "proprietario", "administrador", "gestor", "operacional"].includes(role ?? "");
}

export function canAdminCommunication(role: string | null) {
  return ["superadmin", "proprietario", "administrador", "gestor"].includes(role ?? "");
}
