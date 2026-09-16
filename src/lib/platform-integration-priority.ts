export type PlatformIntegrationPriority = "critical" | "high" | "normal" | "recovered";

type IncidentPriorityInput = {
  failed_at: string;
  attempts: number;
  status: "open" | "in_progress" | "resolved";
  is_active_failure: boolean;
  assigned_to: string | null;
};

export function integrationIncidentAgeMinutes(failedAt: string, now = new Date()): number {
  const timestamp = new Date(failedAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
}

export function platformIntegrationPriority(
  incident: IncidentPriorityInput,
  now = new Date(),
): PlatformIntegrationPriority {
  if (incident.status === "resolved") return "recovered";
  if (!incident.is_active_failure) return "normal";

  const ageMinutes = integrationIncidentAgeMinutes(incident.failed_at, now);
  if (incident.attempts >= 3 || ageMinutes >= 240) return "critical";
  if (ageMinutes >= 60 || (incident.status === "open" && ageMinutes >= 30)) return "high";
  return "normal";
}

export function integrationIncidentAgeLabel(failedAt: string, now = new Date()): string {
  const minutes = integrationIncidentAgeMinutes(failedAt, now);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1_440) return `há ${Math.floor(minutes / 60)} h`;
  return `há ${Math.floor(minutes / 1_440)} dia(s)`;
}

const priorityRank: Record<PlatformIntegrationPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  recovered: 3,
};

export function comparePlatformIntegrationPriority(
  left: IncidentPriorityInput,
  right: IncidentPriorityInput,
  now = new Date(),
): number {
  const priorityDifference =
    priorityRank[platformIntegrationPriority(left, now)] -
    priorityRank[platformIntegrationPriority(right, now)];
  if (priorityDifference !== 0) return priorityDifference;

  const assignmentDifference =
    Number(Boolean(left.assigned_to)) - Number(Boolean(right.assigned_to));
  if (assignmentDifference !== 0) return assignmentDifference;
  return new Date(left.failed_at).getTime() - new Date(right.failed_at).getTime();
}
