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
