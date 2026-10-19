/** Campos existentes de processes e process_checklist_items; sem schema paralelo. */
export type ConsultingProjectValues = {
  title: string;
  description: string;
  owner_name: string;
  due_date: string;
};
export const CONSULTING_DELIVERY_STATUSES = [
  "pendente",
  "recebido",
  "em_analise",
  "aprovado",
  "rejeitado",
] as const;
export type ConsultingDeliveryStatus = (typeof CONSULTING_DELIVERY_STATUSES)[number];
export type ConsultingDeliveryValues = {
  title: string;
  description: string;
  assignee_name: string;
  due_date: string;
  status: ConsultingDeliveryStatus;
  required: boolean;
};
export type ConsultingDelivery = ConsultingDeliveryValues & { id: string };
export function validConsultingDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function consultingProjectValid(value: ConsultingProjectValues) {
  return (
    value.title.trim().length >= 3 &&
    value.title.trim().length <= 160 &&
    value.description.length <= 4000 &&
    value.owner_name.length <= 120 &&
    validConsultingDate(value.due_date)
  );
}
export function consultingDeliveryValid(value: ConsultingDeliveryValues) {
  return (
    value.title.trim().length >= 3 &&
    value.title.trim().length <= 160 &&
    value.description.length <= 2000 &&
    value.assignee_name.length <= 120 &&
    validConsultingDate(value.due_date) &&
    CONSULTING_DELIVERY_STATUSES.includes(value.status)
  );
}
export function consultingProjectPayload(value: ConsultingProjectValues) {
  if (!consultingProjectValid(value)) throw new Error("CONSULTING_PROJECT_INVALID");
  return {
    title: value.title.trim(),
    description: value.description.trim() || null,
    owner_name: value.owner_name.trim() || null,
    due_date: value.due_date || null,
  };
}
export function consultingDeliveryPayload(value: ConsultingDeliveryValues) {
  if (!consultingDeliveryValid(value)) throw new Error("CONSULTING_DELIVERY_INVALID");
  return {
    title: value.title.trim(),
    description: value.description.trim() || null,
    assignee_name: value.assignee_name.trim() || null,
    due_date: value.due_date || null,
    status: value.status,
    required: value.required,
  };
}
/** Somente aprovado conta como concluído; entregue/em validação ainda requerem acompanhamento. */
export function consultingDeliveryProgress(
  items: readonly { status: string; due_date: string | null }[],
  today: string,
) {
  const done = items.filter((item) => item.status === "aprovado").length;
  return {
    total: items.length,
    done,
    pending: items.length - done,
    overdue: items.filter(
      (item) => item.status !== "aprovado" && item.due_date && item.due_date < today,
    ).length,
    percent: items.length ? Math.round((done / items.length) * 100) : 0,
  };
}
