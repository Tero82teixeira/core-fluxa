export const COMMERCIAL_METRICS = [
  "received",
  "waiting",
  "active",
  "overdue",
  "unassigned",
  "won",
  "closed",
] as const;
export const COMMERCIAL_ORIGINS = [
  "vitrine",
  "whatsapp",
  "telefone",
  "presencial",
  "outro",
] as const;
export const COMMERCIAL_REASONS = [
  "fechou_negocio",
  "desistiu",
  "sem_imovel",
  "outro",
  "legacy",
] as const;
export type CommercialMetric = (typeof COMMERCIAL_METRICS)[number];
export type CommercialFilters = {
  date_from: string;
  date_to: string;
  timezone: string;
  responsible: string;
  metric?: CommercialMetric;
  origin?: string;
  closure_reason?: string;
};
export type CommercialCounts = Record<CommercialMetric, number> &
  Record<(typeof COMMERCIAL_REASONS)[number], number>;
export type CommercialSummary = {
  totals: CommercialCounts;
  channels: (CommercialCounts & { origin: string })[];
  responsibles: { id: string; name: string }[];
  as_of: string;
};
const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function commercialDefaults(now = new Date()): CommercialFilters {
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return {
    date_from: day(from),
    date_to: day(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    responsible: "",
  };
}
export function validCommercialDates(from: string, to: string): boolean {
  if (![from, to].every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))) return false;
  const start = Date.parse(`${from}T00:00:00Z`),
    end = Date.parse(`${to}T00:00:00Z`);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    new Date(start).toISOString().slice(0, 10) === from &&
    new Date(end).toISOString().slice(0, 10) === to &&
    end >= start &&
    end - start <= 365 * 86400000
  );
}
export type CommercialRow = {
  id: string;
  created_at: string;
  origin: string;
  status: string;
  responsible_user_id: string | null;
  closure_reason: string | null;
  next_contact_at: string | null;
};
export function filterCommercialRows<T extends CommercialRow>(
  rows: T[],
  f: CommercialFilters,
  now = new Date(),
): T[] {
  if (!validCommercialDates(f.date_from, f.date_to)) throw new Error("COMMERCIAL_INVALID");
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: f.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDay = (date: string) => {
    const p = Object.fromEntries(
      format.formatToParts(new Date(date)).map((p) => [p.type, p.value]),
    );
    return `${p.year}-${p.month}-${p.day}`;
  };
  return rows.filter((r) => {
    const d = localDay(r.created_at),
      active = r.status !== "encerrado";
    if (
      d < f.date_from ||
      d > f.date_to ||
      (f.origin && r.origin !== f.origin) ||
      (f.responsible === "unassigned"
        ? r.responsible_user_id !== null
        : f.responsible && r.responsible_user_id !== f.responsible)
    )
      return false;
    if (
      f.closure_reason &&
      (active ||
        (f.closure_reason === "legacy"
          ? r.closure_reason !== null
          : r.closure_reason !== f.closure_reason))
    )
      return false;
    switch (f.metric || "received") {
      case "waiting":
        return r.status === "novo";
      case "active":
        return active;
      case "closed":
        return !active;
      case "unassigned":
        return active && r.responsible_user_id === null;
      case "won":
        return !active && r.closure_reason === "fechou_negocio";
      case "overdue":
        return active && Boolean(r.next_contact_at && new Date(r.next_contact_at) < now);
      default:
        return true;
    }
  });
}
export function summarizeCommercialRows(
  rows: CommercialRow[],
  f: CommercialFilters,
  now = new Date(),
): CommercialSummary {
  const base = filterCommercialRows(rows, { ...f, metric: "received", closure_reason: "" }, now);
  const counts = (items: CommercialRow[]): CommercialCounts =>
    Object.fromEntries([
      ...COMMERCIAL_METRICS.map((metric) => [
        metric,
        filterCommercialRows(items, { ...f, metric, closure_reason: "" }, now).length,
      ]),
      ...COMMERCIAL_REASONS.map((reason) => [
        reason,
        items.filter(
          (r) =>
            r.status === "encerrado" &&
            (reason === "legacy" ? r.closure_reason === null : r.closure_reason === reason),
        ).length,
      ]),
    ]) as CommercialCounts;
  return {
    totals: counts(base),
    channels: COMMERCIAL_ORIGINS.map((origin) => ({
      origin,
      ...counts(base.filter((r) => r.origin === origin)),
    })),
    responsibles: [
      ...new Set(rows.flatMap((r) => (r.responsible_user_id ? [r.responsible_user_id] : []))),
    ].map((id) => ({ id, name: id })),
    as_of: now.toISOString(),
  };
}
