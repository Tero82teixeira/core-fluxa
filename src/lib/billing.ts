import type { AppRole } from "@/lib/domain";

export const KIWIFY_CHECKOUT_URL = "https://pay.kiwify.com.br/tRg38TD";

const SUBSCRIPTION_MANAGER_ROLES: AppRole[] = [
  "superadmin",
  "proprietario",
  "administrador",
];

export function canManageSubscription(role: AppRole | null): boolean {
  return role !== null && SUBSCRIPTION_MANAGER_ROLES.includes(role);
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
