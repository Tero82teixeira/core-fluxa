import type { AppRole } from "@/lib/domain";

export const KIWIFY_CHECKOUT_URL = "https://pay.kiwify.com.br/tRg38TD";
export const FLUXA_PLAN_NAME = "FLUXA Essencial Mensal";
export const FLUXA_MONTHLY_PRICE = 149.9;

export type KiwifySubscriptionStatus =
  "pending" | "active" | "past_due" | "canceled" | "refunded" | "chargeback";

const SUBSCRIPTION_STATUS_LABELS: Record<KiwifySubscriptionStatus, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  refunded: "Reembolsada",
  chargeback: "Pagamento contestado",
};

const SUBSCRIPTION_MANAGER_ROLES: AppRole[] = ["superadmin", "proprietario", "administrador"];

export function canManageSubscription(role: AppRole | null): boolean {
  return role !== null && SUBSCRIPTION_MANAGER_ROLES.includes(role);
}

export function subscriptionStatusLabel(status: string | null): string {
  if (status && status in SUBSCRIPTION_STATUS_LABELS) {
    return SUBSCRIPTION_STATUS_LABELS[status as KiwifySubscriptionStatus];
  }
  return "Ainda não contratada";
}

export function canRestartKiwifyCheckout(
  status: string | null,
  accessUntil: string | null = null,
  now = new Date(),
): boolean {
  if (status === null || status === "pending" || status === "refunded" || status === "chargeback") {
    return true;
  }
  if (status !== "past_due" && status !== "canceled") return false;
  if (!accessUntil) return status === "canceled";

  const accessEnd = new Date(accessUntil).getTime();
  return Number.isFinite(accessEnd) && accessEnd <= now.getTime();
}

export function buildKiwifyCheckoutUrl({
  organizationId,
  email,
  name,
}: {
  organizationId: string;
  email?: string | null;
  name?: string | null;
}): string {
  const url = new URL(KIWIFY_CHECKOUT_URL);
  url.searchParams.set("s1", organizationId);
  url.searchParams.set("src", "fluxa_app");
  url.searchParams.set("region", "br");
  if (email) url.searchParams.set("email", email);
  if (name) url.searchParams.set("name", name);
  return url.toString();
}
