export type KiwifyEventOutcome = "processed" | "ignored" | "attention";

export type KiwifyHealthEvent = {
  outcome: KiwifyEventOutcome;
};

const EVENT_LABELS: Record<string, string> = {
  order_approved: "Compra aprovada",
  paid: "Pagamento aprovado",
  subscription_renewed: "Assinatura renovada",
  subscription_late: "Pagamento atrasado",
  subscription_delayed: "Pagamento atrasado",
  subscription_overdue: "Pagamento vencido",
  subscription_canceled: "Assinatura cancelada",
  subscription_cancelled: "Assinatura cancelada",
  order_refunded: "Compra reembolsada",
  refunded: "Pagamento reembolsado",
  order_chargedback: "Contestação recebida",
  chargeback: "Contestação recebida",
};

const DIAGNOSTIC_LABELS: Record<string, string> = {
  STALE_EVENT_IGNORED: "Evento antigo ignorado com segurança",
  PENDING_CHECKOUT_EVENT_IGNORED: "Evento não pertence ao novo checkout",
  SUBSCRIPTION_ID_MISMATCH_IGNORED: "Evento de uma assinatura anterior",
  CHECKOUT_NOT_PREPARED: "Checkout da empresa não foi iniciado",
  ORGANIZATION_TRACKING_REQUIRED: "Empresa não identificada no checkout",
  PREPARED_CHECK_FAILED: "Falha ao consultar a preparação do checkout",
  BILLING_EMAIL_MISMATCH: "E-mail do pagamento diferente do checkout",
  EVENT_PROCESSING_FAILED: "Falha ao atualizar a assinatura",
  RETRY_SUCCEEDED_IGNORED: "Falha anterior recuperada com segurança",
};

export function kiwifyEventTypeLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ");
}

export function kiwifyDiagnosticLabel(code: string | null): string | null {
  if (!code) return null;
  return DIAGNOSTIC_LABELS[code] ?? "Evento precisa de verificação";
}

export function kiwifyEventHealthSummary(events: KiwifyHealthEvent[]) {
  return events.reduce(
    (summary, event) => {
      summary[event.outcome] += 1;
      return summary;
    },
    { processed: 0, ignored: 0, attention: 0 },
  );
}
