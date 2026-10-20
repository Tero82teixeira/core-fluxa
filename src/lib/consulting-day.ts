import { validConsultingDate } from "./consulting-project.ts";

export const CONSULTING_DAY_KINDS = ["delivery", "followup", "project"] as const;
export type ConsultingDayKind = (typeof CONSULTING_DAY_KINDS)[number];
export const CONSULTING_DAY_PAGE_SIZE = 6;
export type ConsultingDayItem = {
  kind: ConsultingDayKind;
  id: string;
  process_id: string;
  code: string;
  project_title: string;
  client_name: string;
  title: string;
  due_date: string;
};
export type ConsultingDay = {
  today: string;
  horizon: string;
  kind: ConsultingDayKind;
  page: number;
  counts: Record<ConsultingDayKind, number>;
  total: number;
  items: ConsultingDayItem[];
};
export function consultingDayHorizon(today: string) {
  if (!today || !validConsultingDate(today)) throw new Error("CONSULTING_DAY_DATE_INVALID");
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
/** Demo-only aggregation mirrors the SQL rules, using civil dates and explicit fields. */
export function buildConsultingDay(
  today: string,
  source: readonly ConsultingDayItem[],
  kind: ConsultingDayKind,
  page: number,
): ConsultingDay {
  const horizon = consultingDayHorizon(today);
  if (!CONSULTING_DAY_KINDS.includes(kind) || !Number.isInteger(page) || page < 0 || page > 1000000)
    throw new Error("CONSULTING_DAY_FILTER_INVALID");
  const eligible = source.filter(
    (item) =>
      item.due_date &&
      validConsultingDate(item.due_date) &&
      (item.kind === "delivery" ? item.due_date < today : item.due_date <= horizon),
  );
  const all = eligible
    .filter((item) => item.kind === kind)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
  return {
    today,
    horizon,
    kind,
    page,
    counts: Object.fromEntries(
      CONSULTING_DAY_KINDS.map((key) => [key, eligible.filter((item) => item.kind === key).length]),
    ) as ConsultingDay["counts"],
    total: all.length,
    items: all.slice(page * CONSULTING_DAY_PAGE_SIZE, (page + 1) * CONSULTING_DAY_PAGE_SIZE),
  };
}
