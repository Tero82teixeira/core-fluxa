export const MONITORING_STATUSES = ["novo", "em_analise", "acompanhado", "resolvido", "ignorado"] as const;
export const MONITORING_PRIORITIES = ["baixa", "media", "alta", "critica"] as const;
export const STALE_PROCESS_DAYS = 14;

export type MonitoringStatus = (typeof MONITORING_STATUSES)[number];
export type MonitoringPriority = (typeof MONITORING_PRIORITIES)[number];
export type MonitoringSource = "tarefa" | "processo" | "documento" | "comunicacao" | "financeiro" | "outro";

export type MonitoringAlert = {
  organization_id: string; source_type: MonitoringSource; source_id: string; alert_kind: string;
  title: string; description: string | null; client_id: string | null; client_name: string | null;
  process_id: string | null; process_code: string | null; responsible_id: string | null; responsible_name: string | null;
  source_priority: string | null; suggested_priority: MonitoringPriority; relevant_at: string | null;
  last_movement_at: string | null; days_delta: number | null; reason: string; source_status: string | null;
  monitoring_status: MonitoringStatus; assigned_to: string | null; assigned_name: string | null;
  priority_override: MonitoringPriority | null; notes: string | null; state_updated_at: string | null;
};

export type MonitoringFilter = { search?: string; type?: string; status?: string; priority?: string; window?: string; clientId?: string; responsibleId?: string };

export function effectivePriority(alert: Pick<MonitoringAlert, "priority_override" | "suggested_priority">) {
  return alert.priority_override ?? alert.suggested_priority;
}

export function classifyDeadline(date: string, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return { days, overdue: days < 0, today: days === 0, next7: days > 0 && days <= 7, next30: days > 0 && days <= 30 };
}

export function suggestPriority(days: number | null, original?: string | null, amount = 0): MonitoringPriority {
  if ((days !== null && days <= -7) || original === "urgente" || original === "critica" || amount >= 50_000) return "critica";
  if ((days !== null && days < 0) || original === "alta" || amount >= 10_000) return "alta";
  if (days !== null && days <= 7) return "media";
  return "baixa";
}

export function uniqueAlerts(alerts: MonitoringAlert[]) {
  return [...new Map(alerts.map((alert) => [`${alert.organization_id}:${alert.source_type}:${alert.source_id}:${alert.alert_kind}`, alert])).values()];
}

export function filterMonitoringAlerts(alerts: MonitoringAlert[], filter: MonitoringFilter) {
  const term = filter.search?.trim().toLocaleLowerCase("pt-BR");
  return alerts.filter((alert) => {
    const priority = effectivePriority(alert);
    if (filter.type && filter.type !== "todos" && alert.source_type !== filter.type) return false;
    if (filter.status && filter.status !== "todos" && alert.monitoring_status !== filter.status) return false;
    if (filter.priority && filter.priority !== "todos" && priority !== filter.priority) return false;
    if (filter.clientId && filter.clientId !== "todos" && alert.client_id !== filter.clientId) return false;
    if (filter.responsibleId && filter.responsibleId !== "todos" && alert.responsible_id !== filter.responsibleId && alert.assigned_to !== filter.responsibleId) return false;
    if (filter.window === "vencidos" && !(alert.days_delta !== null && alert.days_delta < 0)) return false;
    if (filter.window === "hoje" && alert.days_delta !== 0) return false;
    if (filter.window === "7" && !(alert.days_delta !== null && alert.days_delta >= 0 && alert.days_delta <= 7)) return false;
    if (filter.window === "30" && !(alert.days_delta !== null && alert.days_delta >= 0 && alert.days_delta <= 30)) return false;
    if (filter.window === "sem_movimentacao" && alert.alert_kind !== "processo_sem_movimentacao") return false;
    if (term && ![alert.title, alert.description, alert.client_name, alert.process_code, alert.responsible_name].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term)) return false;
    return true;
  });
}

export function sourcePath(alert: Pick<MonitoringAlert, "source_type" | "source_id" | "process_id" | "client_id">) {
  if (alert.source_type === "processo" || alert.process_id) return alert.process_id ? `/processos/${alert.process_id}` : `/processos/${alert.source_id}`;
  if (alert.source_type === "tarefa") return "/tarefas";
  if (alert.source_type === "documento") return "/documentos";
  if (alert.source_type === "comunicacao") return "/comunicacao";
  if (alert.source_type === "financeiro") return "/financeiro";
  return alert.client_id ? `/clientes/${alert.client_id}` : "/monitoramento";
}
