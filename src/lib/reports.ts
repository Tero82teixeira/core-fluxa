import type { AppRole } from "@/lib/domain";
import { effectivePriority, type MonitoringAlert } from "./monitoring.ts";

export type PeriodPreset = "7d" | "30d" | "90d" | "month" | "previous_month" | "year" | "custom";
export type ReportFilters = {
  period: PeriodPreset;
  from?: string;
  to?: string;
  clientId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  processId?: string;
};

type ReportRow = Record<string, any>;
export type ReportRowFilters = {
  range: ReturnType<typeof periodRange>;
  clientId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  processId?: string;
};

type ReportRowFilterOptions = {
  clientKey: "id" | "client_id";
  dateKey?: string;
  processOwnId?: boolean;
};

/** Applies the shared report controls with an explicit client key for each collection. */
export function filterReportRows<T extends ReportRow>(rows: T[], filters: ReportRowFilters, options: ReportRowFilterOptions) {
  const dateKey = options.dateKey ?? "created_at";
  return rows.filter((row) =>
    isInPeriod(row[dateKey] as string | null | undefined, filters.range) &&
    (!filters.clientId || filters.clientId === "all" || row[options.clientKey] === filters.clientId) &&
    (!filters.assigneeId || filters.assigneeId === "all" || row.assignee_id === filters.assigneeId || row.owner_id === filters.assigneeId || row.responsible_user_id === filters.assigneeId) &&
    (!filters.status || filters.status === "all" || row.status === filters.status || row.stage === filters.status) &&
    (!filters.priority || filters.priority === "all" || row.priority === filters.priority) &&
    (!filters.processId || filters.processId === "all" || row.process_id === filters.processId || (options.processOwnId && row.id === filters.processId)) &&
    !row.archived_at && !row.deleted_at);
}

export function clientProcessSummary(clients: ReportRow[], processes: ReportRow[]) {
  const clientIdsWithProcesses = new Set(processes.map((process) => process.client_id));
  const withProcesses = clients.filter((client) => clientIdsWithProcesses.has(client.id)).length;
  return { withProcesses, withoutProcesses: clients.length - withProcesses };
}

export type CommercialFunnelStage = {
  key: "leads" | "registration" | "active" | "with_process" | "won";
  label: string;
  value: number;
};

/** Snapshot do avanço comercial sem transformar ausência de dados em conversão presumida. */
export function commercialFunnel(clients: ReportRow[], processes: ReportRow[]): CommercialFunnelStage[] {
  const availableClients = clients.filter((client) => !client.archived_at);
  const availableProcesses = processes.filter((process) => !process.archived_at && process.stage !== "cancelado");
  const clientsWithProcess = new Set(availableProcesses.map((process) => process.client_id).filter(Boolean));
  const wonClients = new Set(
    availableProcesses
      .filter((process) => ["deferido", "finalizado"].includes(process.stage))
      .map((process) => process.client_id)
      .filter(Boolean),
  );
  return [
    { key: "leads", label: "Leads", value: availableClients.filter((client) => client.status === "lead").length },
    { key: "registration", label: "Em cadastro", value: availableClients.filter((client) => client.status === "em_cadastro").length },
    { key: "active", label: "Clientes ativos", value: availableClients.filter((client) => ["ativo", "com_pendencia"].includes(client.status)).length },
    { key: "with_process", label: "Com processo", value: clientsWithProcess.size },
    { key: "won", label: "Com conclusão", value: wonClients.size },
  ];
}

export type ClientRiskRow = {
  id: string;
  name: string;
  ownerName: string | null;
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
  lastInteractionAt: string | null;
};

const daysSince = (value: string | null | undefined, now: Date) =>
  value ? Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000)) : null;

/** Prioriza sinais comprováveis; o escore é explicável e não usa inferência de IA. */
export function clientLossRisk(
  clients: ReportRow[],
  tasks: ReportRow[],
  processes: ReportRow[],
  now = new Date(),
): ClientRiskRow[] {
  return clients
    .filter((client) => !client.archived_at && !["inativo", "arquivado"].includes(client.status))
    .map((client) => {
      let score = 0;
      const reasons: string[] = [];
      const inactivity = daysSince(client.last_interaction_at ?? client.created_at, now);
      const clientTasks = tasks.filter((task) => task.client_id === client.id && !task.archived_at && !task.deleted_at);
      const clientProcesses = processes.filter((process) => process.client_id === client.id && !process.archived_at && !["finalizado", "deferido", "cancelado"].includes(process.stage));
      const overdueTasks = clientTasks.filter((task) => isOverdue(task.due_at, task.status, now)).length;
      const overdueProcesses = clientProcesses.filter((process) => isOverdue(process.due_date, process.stage, now)).length;
      const staleProcesses = clientProcesses.filter((process) => (daysSince(process.last_movement_at, now) ?? 0) >= 30).length;

      if (client.status === "com_pendencia") { score += 35; reasons.push("cliente com pendência"); }
      if (client.status === "lead" && (inactivity ?? 0) >= 7) { score += 40; reasons.push(`lead sem contato há ${inactivity} dias`); }
      else if (client.status === "lead" && (inactivity ?? 0) >= 3) { score += 25; reasons.push(`lead sem contato há ${inactivity} dias`); }
      else if ((inactivity ?? 0) >= 60) { score += 35; reasons.push(`sem interação há ${inactivity} dias`); }
      else if ((inactivity ?? 0) >= 30) { score += 20; reasons.push(`sem interação há ${inactivity} dias`); }
      if (overdueTasks) { score += Math.min(30, overdueTasks * 15); reasons.push(`${overdueTasks} tarefa(s) atrasada(s)`); }
      if (overdueProcesses) { score += Math.min(30, overdueProcesses * 20); reasons.push(`${overdueProcesses} processo(s) atrasado(s)`); }
      if (staleProcesses) { score += Math.min(20, staleProcesses * 10); reasons.push(`${staleProcesses} processo(s) sem movimentação`); }
      score = Math.min(100, score);
      return {
        id: client.id,
        name: client.name,
        ownerName: client.owner_name ?? null,
        score,
        level: score >= 60 ? "high" as const : score >= 30 ? "medium" as const : "low" as const,
        reasons,
        lastInteractionAt: client.last_interaction_at ?? null,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
}

export type BusinessAgendaItem = {
  id: string;
  kind: "task" | "process" | "document" | "monitoring";
  title: string;
  date: string;
  responsible: string | null;
  route: string;
  timing: "overdue" | "today" | "upcoming";
};

/** Reúne compromissos já existentes sem criar ou alterar prazos. */
export function businessAgenda(
  data: { tasks: ReportRow[]; processes: ReportRow[]; documents: ReportRow[]; monitoring: ReportRow[] },
  horizonDays = 30,
  now = new Date(),
): BusinessAgendaItem[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + horizonDays); end.setHours(23, 59, 59, 999);
  const item = (kind: BusinessAgendaItem["kind"], row: ReportRow, date: string | null | undefined, title: string, responsible: string | null, route: string) => {
    if (!date) return null;
    const moment = new Date(date.length === 10 ? `${date}T00:00:00` : date);
    if (Number.isNaN(moment.getTime()) || moment > end) return null;
    const day = new Date(moment); day.setHours(0, 0, 0, 0);
    return { id: `${kind}:${row.id ?? row.source_id}`, kind, title, date, responsible, route, timing: day < today ? "overdue" as const : day.getTime() === today.getTime() ? "today" as const : "upcoming" as const };
  };
  return [
    ...data.tasks.filter((row) => !["concluida", "cancelada", "arquivada"].includes(row.status) && !row.archived_at && !row.deleted_at).map((row) => item("task", row, row.due_at, row.title, row.assignee_name, "/tarefas")),
    ...data.processes.filter((row) => !["finalizado", "deferido", "cancelado", "arquivado"].includes(row.stage) && !row.archived_at).map((row) => item("process", row, row.due_date, row.title || row.code, row.owner_name, `/processos/${row.id}`)),
    ...data.documents.filter((row) => row.status !== "aprovado" && !row.archived_at).map((row) => item("document", row, row.expiration_date, row.title, row.uploaded_by_name, "/documentos")),
    ...data.monitoring.filter((row) => !["resolvido", "ignorado"].includes(row.monitoring_status)).map((row) => item("monitoring", row, row.relevant_at, row.title, row.assigned_name ?? row.responsible_name, "/monitoramento")),
  ].filter((value): value is BusinessAgendaItem => Boolean(value)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.title.localeCompare(b.title, "pt-BR"));
}

export function currentMonthPerformance(clients: ReportRow[], tasks: ReportRow[], processes: ReportRow[], movements: ReportRow[], now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const existingProcessIds = new Set(processes.filter((row) => !row.archived_at).map((row) => row.id));
  const completedProcessIds = new Set(
    movements
      .filter((row) => existingProcessIds.has(row.process_id) && ["deferido", "finalizado"].includes(row.to_stage) && row.created_at?.slice(0, 7) === month)
      .map((row) => row.process_id),
  );
  return {
    newClients: clients.filter((row) => !row.archived_at && row.status !== "lead" && row.created_at?.slice(0, 7) === month).length,
    completedTasks: tasks.filter((row) => !row.archived_at && !row.deleted_at && row.status === "concluida" && row.completed_at?.slice(0, 7) === month).length,
    completedProcesses: completedProcessIds.size,
  };
}

export function periodRange(preset: PeriodPreset, now = new Date(), custom?: { from?: string; to?: string }) {
  const end = new Date(now);
  const start = new Date(now);
  if (preset === "7d" || preset === "30d" || preset === "90d") start.setDate(start.getDate() - Number(preset.slice(0, -1)) + 1);
  if (preset === "month") start.setDate(1);
  if (preset === "previous_month") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }
  if (preset === "year") start.setMonth(0, 1);
  if (preset === "custom") {
    if (custom?.from) start.setTime(new Date(`${custom.from}T00:00:00`).getTime());
    if (custom?.to) end.setTime(new Date(`${custom.to}T23:59:59.999`).getTime());
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

export function isInPeriod(value: string | null | undefined, range: ReturnType<typeof periodRange>) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return timestamp >= range.from.getTime() && timestamp <= range.to.getTime();
}

export function isOverdue(due: string | null | undefined, status?: string, now = new Date()) {
  return Boolean(due && !["concluida", "cancelada", "arquivada", "aprovado"].includes(status ?? "") && new Date(due).getTime() < now.getTime());
}

export function monitoringBuckets(expiration: string | null | undefined, now = new Date()) {
  if (!expiration) return { expired: false, in7: false, in30: false };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiration.slice(0, 10)}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  return { expired: days < 0, in7: days >= 0 && days <= 7, in30: days >= 0 && days <= 30 };
}

export type MonitoringReportFilters = {
  range: ReturnType<typeof periodRange>;
  clientId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  processId?: string;
};

export const isActiveMonitoring = (alert: Pick<MonitoringAlert, "monitoring_status">) =>
  !["resolvido", "ignorado"].includes(alert.monitoring_status);

/** Applies report controls using the operational alert model, without changing the view's RLS semantics. */
export function filterMonitoringReport(alerts: MonitoringAlert[], filters: MonitoringReportFilters) {
  return alerts.filter((alert) =>
    isInPeriod(alert.relevant_at, filters.range) &&
    (!filters.clientId || filters.clientId === "all" || alert.client_id === filters.clientId) &&
    (!filters.assigneeId || filters.assigneeId === "all" || alert.assigned_to === filters.assigneeId || alert.responsible_id === filters.assigneeId) &&
    (!filters.status || filters.status === "all" || alert.monitoring_status === filters.status) &&
    (!filters.priority || filters.priority === "all" || effectivePriority(alert) === filters.priority) &&
    (!filters.processId || filters.processId === "all" || alert.process_id === filters.processId));
}

export function monitoringReportMetrics(alerts: MonitoringAlert[], now = new Date()) {
  return {
    active: alerts.filter(isActiveMonitoring).length,
    overdue: alerts.filter((alert) => monitoringBuckets(alert.relevant_at, now).expired).length,
    in30: alerts.filter((alert) => monitoringBuckets(alert.relevant_at, now).in30).length,
  };
}

/** Stable public columns for the monitoring table and both CSV export entry points. */
export function monitoringExportRows(alerts: MonitoringAlert[]) {
  return alerts.map((alert) => ({
    title: alert.title,
    source_type: alert.source_type,
    monitoring_status: alert.monitoring_status,
    priority: effectivePriority(alert),
    responsible: alert.assigned_name ?? alert.responsible_name,
    client: alert.client_name,
    process: alert.process_code,
    relevant_at: alert.relevant_at,
    last_movement_at: alert.last_movement_at,
  }));
}

export function groupCount<T>(rows: T[], key: (row: T) => string | null | undefined) {
  return rows.reduce<Record<string, number>>((result, row) => {
    const value = key(row) || "Não informado";
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

export const canSeeSensitive = (role: AppRole | null) => ["superadmin", "proprietario", "administrador", "gestor"].includes(role ?? "");

export function sanitizeClient<T extends Record<string, unknown>>(row: T, role: AppRole | null): T {
  if (canSeeSensitive(role)) return row;
  const safe = { ...row };
  for (const field of ["document", "document_digits", "birth_date", "email", "phone", "whatsapp", "zip_code", "street", "number", "complement", "district", "notes"]) delete safe[field];
  return safe;
}

const csvValue = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export function createCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "\uFEFF";
  const columns = Object.keys(rows[0]);
  return `\uFEFF${columns.map(csvValue).join(";")}\r\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(";")).join("\r\n")}`;
}

export function downloadCsv(type: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([createCsv(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fluxa-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
