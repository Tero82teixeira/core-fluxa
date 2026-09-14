import type { IntegrationReportItem, WebhookEvent } from "@/hooks/use-integration-actions";

export const WEBHOOK_STATUS_LABEL: Record<WebhookEvent["status"], string> = {
  processed: "Processado",
  pending: "Pendente",
  attention: "Atenção",
  ignored: "Ignorado com segurança",
  failed: "Falhou",
};

export function filterWebhookEvents(
  events: WebhookEvent[],
  provider: string,
  status: string,
): WebhookEvent[] {
  return events.filter(
    (event) =>
      (provider === "all" || event.provider === provider) &&
      (status === "all" || event.status === status),
  );
}

function csvCell(value: string | number | null): string {
  const raw = value == null ? "" : String(value);
  const protectedValue = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function integrationReportCsv(items: IntegrationReportItem[]): string {
  const header = [
    "Integração",
    "Total",
    "Processados",
    "Alertas",
    "Falhas",
    "Taxa de sucesso (%)",
    "Último evento",
  ];
  const rows = items.map((item) => [
    item.label,
    item.total_count,
    item.processed_count,
    item.warning_count,
    item.failed_count,
    item.success_rate,
    item.last_event_at,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
}
