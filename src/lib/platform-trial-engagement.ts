export type TrialEngagementFilter = "all" | "attention" | "engaged" | "not_started";

export type TrialEngagementRow = {
  effective_status: string;
  onboarding_completed: boolean;
  created_at: string;
  days_remaining: number | null;
  last_activity_at: string | null;
  client_count: number;
  process_count: number;
  task_count: number;
  document_count: number;
};

export function trialUsage(row: TrialEngagementRow) {
  const counts = [row.client_count, row.process_count, row.task_count, row.document_count];
  const total = counts.reduce((sum, value) => sum + value, 0);
  const modules = counts.filter((value) => value > 0).length;
  const level =
    !row.onboarding_completed || total === 0
      ? "not_started"
      : modules >= 3 || total >= 8
        ? "engaged"
        : "exploring";
  return { level, total, modules } as const;
}

export function trialNeedsAttention(row: TrialEngagementRow, now = new Date()) {
  if (row.effective_status !== "trial") return false;
  if ((row.days_remaining ?? 99) <= 3) return true;
  const reference = new Date(row.last_activity_at ?? row.created_at).getTime();
  const inactiveDays = Math.floor((now.getTime() - reference) / 86_400_000);
  return !row.onboarding_completed || trialUsage(row).total === 0 || inactiveDays >= 3;
}

export function matchesTrialEngagementFilter(
  row: TrialEngagementRow,
  filter: TrialEngagementFilter,
  now = new Date(),
) {
  if (filter === "all") return true;
  if (row.effective_status !== "trial") return false;
  if (filter === "attention") return trialNeedsAttention(row, now);
  return trialUsage(row).level === filter;
}
