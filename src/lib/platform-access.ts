export type PlatformAccessFilter = "all" | "never" | "inactive";

export type PlatformAccessRow = {
  last_access_at: string | null;
};

export type PlatformAccessStatus = "never" | "active" | "recent" | "inactive";

const DAY_MS = 86_400_000;

export function platformAccessStatus(
  row: PlatformAccessRow,
  now = new Date(),
): PlatformAccessStatus {
  if (!row.last_access_at) return "never";
  const elapsed = Math.max(0, now.getTime() - new Date(row.last_access_at).getTime());
  if (elapsed < DAY_MS) return "active";
  if (elapsed < 3 * DAY_MS) return "recent";
  return "inactive";
}

export function matchesPlatformAccessFilter(
  row: PlatformAccessRow,
  filter: PlatformAccessFilter,
  now = new Date(),
) {
  if (filter === "all") return true;
  const status = platformAccessStatus(row, now);
  if (filter === "never") return status === "never";
  return status === "inactive";
}
