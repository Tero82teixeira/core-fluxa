import { FLUXA_MONTHLY_PRICE } from "./billing.ts";

export type PlatformSubscriptionFilter = "all" | "active" | "pending" | "attention" | "not_started";

export type PlatformBillingOrganization = {
  organization_id: string;
  effective_status: string;
};

export type PlatformBillingSubscription = {
  organization_id: string;
  status: string;
};

export type ArchivableSubscription = {
  status: string;
  access_until?: string | null;
};

const ATTENTION_SUBSCRIPTION_STATUSES = new Set(["past_due", "canceled", "refunded", "chargeback"]);

export function matchesPlatformSubscriptionFilter(
  status: string | null,
  filter: PlatformSubscriptionFilter,
  effectiveCommercialStatus?: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "not_started") return status === null;
  if (filter === "active") return status === "active";
  if (filter === "pending") return status === "pending";
  return (
    effectiveCommercialStatus === "expired" ||
    effectiveCommercialStatus === "suspended" ||
    (status !== null && ATTENTION_SUBSCRIPTION_STATUSES.has(status))
  );
}

export function platformBillingMetrics(
  organizations: PlatformBillingOrganization[],
  subscriptions: PlatformBillingSubscription[],
) {
  const organizationIds = new Set(
    organizations.map((organization) => organization.organization_id),
  );
  const relevantSubscriptions = subscriptions.filter((subscription) =>
    organizationIds.has(subscription.organization_id),
  );
  const subscriptionsByOrganization = new Map(
    relevantSubscriptions.map((subscription) => [subscription.organization_id, subscription]),
  );
  const activeSubscriptions = relevantSubscriptions.filter(
    (subscription) => subscription.status === "active",
  ).length;
  const attentionOrganizations = organizations.filter((organization) => {
    const subscription = subscriptionsByOrganization.get(organization.organization_id);
    return (
      organization.effective_status === "expired" ||
      organization.effective_status === "suspended" ||
      (subscription !== undefined && ATTENTION_SUBSCRIPTION_STATUSES.has(subscription.status))
    );
  }).length;

  return {
    activeSubscriptions,
    attentionOrganizations,
    monthlyRecurringRevenue: activeSubscriptions * FLUXA_MONTHLY_PRICE,
  };
}

export function canArchivePlatformOrganization(
  subscription: ArchivableSubscription | null | undefined,
  now = new Date(),
): boolean {
  if (!subscription) return true;
  if (subscription.status === "active" || subscription.status === "past_due") return false;
  if (subscription.status !== "canceled" || !subscription.access_until) return true;
  return new Date(subscription.access_until).getTime() <= now.getTime();
}
