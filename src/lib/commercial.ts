export type CommercialStatus = "trial" | "active" | "suspended" | "cancelled";

export type CommercialProfile = {
  status: CommercialStatus;
  plan_code: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
} | null;

export type CommercialAccess = {
  allowed: boolean;
  daysRemaining: number | null;
  reason: "active" | "trial" | "expired" | "suspended" | "cancelled" | "legacy";
};

export function resolveCommercialAccess(
  profile: CommercialProfile,
  now = new Date(),
): CommercialAccess {
  // Safe rollout: a workspace created before the migration is never locked by
  // a temporary read failure. The database backfill still records it as active.
  if (!profile) return { allowed: true, daysRemaining: null, reason: "legacy" };
  if (profile.status === "active")
    return { allowed: true, daysRemaining: null, reason: "active" };
  if (profile.status === "suspended")
    return { allowed: false, daysRemaining: null, reason: "suspended" };
  if (profile.status === "cancelled")
    return { allowed: false, daysRemaining: null, reason: "cancelled" };

  const end = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  if (!end || Number.isNaN(end.getTime()) || end.getTime() <= now.getTime())
    return { allowed: false, daysRemaining: 0, reason: "expired" };

  const daysRemaining = Math.max(
    1,
    Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return { allowed: true, daysRemaining, reason: "trial" };
}

export const COMMERCIAL_STATUS_LABEL: Record<CommercialStatus, string> = {
  trial: "Em teste",
  active: "Ativa",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

