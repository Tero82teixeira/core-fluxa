import { communicationIndicators, followUpState } from "@/lib/communication";
import { effectivePriority, type MonitoringAlert } from "@/lib/monitoring";
import { financialBuckets, paymentBalance } from "@/lib/finance";

export type AttentionItem = {
  id: string;
  title: string;
  origin: string;
  related?: string | null;
  responsible?: string | null;
  deadline?: string | null;
  priority: string;
  status?: string | null;
  reason: string;
  href: string;
};

const rank: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

/** Preserva a classificação oficial da view operacional; não cria uma heurística concorrente. */
export function monitoringAttention(alerts: MonitoringAlert[]): AttentionItem[] {
  return alerts
    .filter((alert) => !["resolvido", "ignorado"].includes(alert.monitoring_status))
    .map((alert) => ({
      id: `${alert.source_type}:${alert.source_id}:${alert.alert_kind}`,
      title: alert.title,
      origin: alert.source_type,
      related: alert.client_name ?? alert.process_code,
      responsible: alert.assigned_name ?? alert.responsible_name,
      deadline: alert.relevant_at,
      priority: effectivePriority(alert),
      status: alert.monitoring_status,
      reason: alert.reason,
      href:
        alert.source_type === "tarefa"
          ? "/tarefas"
          : alert.source_type === "financeiro"
            ? "/financeiro"
            : alert.source_type === "comunicacao"
              ? "/comunicacao"
              : alert.source_type === "documento"
                ? "/documentos"
                : "/processos",
    }))
    .sort(
      (a, b) =>
        (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) ||
        String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")),
    );
}

export function financeSummary(data: any, now = new Date()) {
  const transactions = data?.transactions ?? [];
  const payments = data?.payments ?? [];
  const balance = (transaction: any) =>
    paymentBalance(
      Number(transaction.amount),
      payments.filter((p: any) => p.transaction_id === transaction.id),
    );
  const open = transactions.filter((t: any) => !["paid", "cancelled"].includes(t.status));
  const month = now.toISOString().slice(0, 7);
  return {
    balance: (data?.accounts ?? [])
      .filter((a: any) => a.is_active && !a.archived_at)
      .reduce((sum: number, a: any) => sum + Number(a.current_balance), 0),
    receivable: open
      .filter((t: any) => t.type === "income")
      .reduce((s: number, t: any) => s + balance(t), 0),
    payable: open
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + balance(t), 0),
    overdue: open
      .filter((t: any) => financialBuckets(t.due_date, t.status, now).overdue)
      .reduce((s: number, t: any) => s + balance(t), 0),
    incomeMonth: transactions
      .filter((t: any) => t.type === "income" && t.due_date?.startsWith(month))
      .reduce((s: number, t: any) => s + Number(t.amount), 0),
    expenseMonth: transactions
      .filter((t: any) => t.type === "expense" && t.due_date?.startsWith(month))
      .reduce((s: number, t: any) => s + Number(t.amount), 0),
    due: open
      .filter(
        (t: any) =>
          financialBuckets(t.due_date, t.status, now).in7 ||
          financialBuckets(t.due_date, t.status, now).overdue,
      )
      .sort((a: any, b: any) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5)
      .map((t: any) => ({ ...t, remaining: balance(t) })),
  };
}

export function communicationSummary(rows: any[], now = new Date()) {
  const normalized = rows.map((r) => ({
    ...r,
    client_name: r.clients?.name ?? "—",
    assigned_name: r.assigned_to,
  }));
  return {
    ...communicationIndicators(normalized, now),
    attention: normalized
      .filter(
        (r) =>
          followUpState(r.follow_up_at, now) === "overdue" ||
          ["aguardando_cliente", "aguardando_equipe"].includes(r.status),
      )
      .slice(0, 5),
  };
}
