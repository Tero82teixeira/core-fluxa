export type CommercialStatus = "trial" | "active" | "suspended";
export type EffectiveCommercialStatus = CommercialStatus | "expired";

export type CommercialOrganization = {
  commercial_status: CommercialStatus;
  trial_ends_at: string | null;
};

const DAY_MS = 86_400_000;

export function trialDaysRemaining(trialEndsAt: string | null, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS));
}

export function effectiveCommercialStatus(
  organization: CommercialOrganization,
  now = new Date(),
): EffectiveCommercialStatus {
  if (organization.commercial_status !== "trial") return organization.commercial_status;
  return (trialDaysRemaining(organization.trial_ends_at, now) ?? 0) > 0 ? "trial" : "expired";
}

export function hasCommercialAccess(
  organization: CommercialOrganization,
  now = new Date(),
): boolean {
  const status = effectiveCommercialStatus(organization, now);
  return status === "active" || status === "trial";
}

export const COMMERCIAL_STATUS_LABEL: Record<EffectiveCommercialStatus, string> = {
  trial: "Em teste",
  active: "Ativa",
  suspended: "Suspensa",
  expired: "Teste vencido",
};
