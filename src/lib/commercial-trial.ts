export type CommercialStatus = "trial" | "active" | "suspended";
export type EffectiveCommercialStatus = CommercialStatus | "expired";

export type CommercialOrganization = {
  commercial_status: CommercialStatus;
  trial_ends_at: string | null;
};

const DAY_MS = 86_400_000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

export function trialDaysRemaining(trialEndsAt: string | null, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  const remainingMs = end - now.getTime();
  if (remainingMs <= 0) return 0;

  const roundedUpDays = Math.ceil(remainingMs / DAY_MS);
  const overflowMs = remainingMs % DAY_MS;

  // O prazo nasce no relógio do banco. Se o dispositivo estiver poucos
  // minutos atrasado, 14 dias podem parecer 14 dias + alguns segundos e o
  // arredondamento exibiria 15. A tolerância só remove esse excesso sobre um
  // dia inteiro; prazos menores que um dia continuam mostrando 1 até vencer.
  if (
    roundedUpDays > 1 &&
    overflowMs > 0 &&
    overflowMs <= CLOCK_SKEW_TOLERANCE_MS
  ) {
    return roundedUpDays - 1;
  }

  return roundedUpDays;
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
