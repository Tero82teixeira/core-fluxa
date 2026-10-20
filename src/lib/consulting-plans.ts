import { validConsultingDate } from "./consulting-project.ts";
export type MonthlyActivity = { title: string; day: number };
export type MonthlyPlanValues = {
  service_name: string;
  monthly_amount: number;
  starts_on: string;
  ends_on: string;
  status: "ativo" | "pausado" | "encerrado";
  return_on: string | null;
  routine: MonthlyActivity[];
};
export type MonthlyPlan = MonthlyPlanValues & {
  process_id: string;
  organization_id: string;
  revision: number;
};
export type MonthlyTask = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  deleted: boolean;
};
export type MonthlyWorkspace = {
  plan: MonthlyPlan | null;
  generated: boolean;
  tasks: MonthlyTask[];
};
export type PlanOverview = {
  items: (MonthlyPlan & { code: string; client_id: string; client_name: string })[];
  total: number;
  ending: number;
  expired: number;
  returns: number;
  today: string;
};
export function validPlanDate(value: string) {
  return (
    Boolean(value) && validConsultingDate(value) && value >= "2000-01-01" && value <= "2100-12-31"
  );
}
export function parseMonthlyAmount(value: string) {
  if (!/^\d{1,10}([,.]\d{1,2})?$/.test(value.trim())) return NaN;
  return Number(value.trim().replace(",", "."));
}
export function validMonthlyPlan(value: MonthlyPlanValues) {
  return (
    value.service_name.trim().length >= 3 &&
    value.service_name.trim().length <= 160 &&
    Number.isFinite(value.monthly_amount) &&
    value.monthly_amount >= 0 &&
    value.monthly_amount <= 9999999999.99 &&
    Math.abs(value.monthly_amount * 100 - Math.round(value.monthly_amount * 100)) < 0.0001 &&
    validPlanDate(value.starts_on) &&
    validPlanDate(value.ends_on) &&
    value.ends_on >= value.starts_on &&
    (!value.return_on || validPlanDate(value.return_on)) &&
    ["ativo", "pausado", "encerrado"].includes(value.status) &&
    value.routine.length >= 1 &&
    value.routine.length <= 20 &&
    value.routine.every(
      (item) =>
        item.title.trim().length >= 3 &&
        item.title.trim().length <= 160 &&
        Number.isInteger(item.day) &&
        item.day >= 1 &&
        item.day <= 31,
    )
  );
}
export function monthInPlan(reference: string, plan: MonthlyPlanValues) {
  return (
    /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(reference) &&
    reference >= plan.starts_on.slice(0, 7) &&
    reference <= plan.ends_on.slice(0, 7)
  );
}
export function monthlyDueDate(reference: string, day: number, plan: MonthlyPlanValues) {
  if (!monthInPlan(reference, plan) || !Number.isInteger(day) || day < 1 || day > 31)
    throw new Error("MONTH_INVALID");
  const [year, month] = reference.split("-").map(Number),
    last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = `${reference}-${String(Math.min(day, last)).padStart(2, "0")}`;
  return date < plan.starts_on ? plan.starts_on : date > plan.ends_on ? plan.ends_on : date;
}
export function normalizedMonthlyPlan(value: MonthlyPlanValues): MonthlyPlanValues {
  if (!validMonthlyPlan(value)) throw new Error("CONSULTING_PLAN_INVALID");
  return {
    ...value,
    service_name: value.service_name.trim(),
    return_on: value.return_on || null,
    routine: value.routine.map((item) => ({ title: item.title.trim(), day: item.day })),
  };
}
export function monthlyPlanError(error: unknown) {
  const message = String((error as { message?: string })?.message ?? "");
  return message.includes("STALE")
    ? "consultingPlans.stale"
    : message.includes("ACCESS_DENIED")
      ? "consultingPlans.denied"
      : message.includes("OUTSIDE_PERIOD")
        ? "consultingPlans.outside"
        : message.includes("NOT_ACTIVE")
          ? "consultingPlans.inactive"
          : "consultingPlans.error";
}

/** Mesmos limites de aviso do painel: 30 dias inclusivos e retorno até hoje. */
export function monthlyPlanAttention(
  plan: Pick<MonthlyPlanValues, "status" | "ends_on" | "return_on">,
  today: string,
) {
  if (plan.status !== "ativo" || !validPlanDate(today))
    return { ending: false, expired: false, returnDue: false };
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    ending: plan.ends_on >= today && plan.ends_on <= end.toISOString().slice(0, 10),
    expired: plan.ends_on < today,
    returnDue: Boolean(plan.return_on && plan.return_on <= today),
  };
}
