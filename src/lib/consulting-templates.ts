import type { TFunction } from "i18next";

export const CONSULTING_TEMPLATE_IDS = ["advisory", "diagnosis", "action"] as const;
export type ConsultingTemplateId = (typeof CONSULTING_TEMPLATE_IDS)[number];
export type ConsultingTemplateDraft = {
  title: string;
  description: string;
  stage: "novo";
  deliveries: string[];
};
export function consultingTemplate(
  id: ConsultingTemplateId,
  t: TFunction,
): ConsultingTemplateDraft {
  if (!CONSULTING_TEMPLATE_IDS.includes(id)) throw new Error("CONSULTING_TEMPLATE_INVALID");
  return {
    title: t(`consultingTemplates.models.${id}.objective`),
    description: t(`consultingTemplates.models.${id}.scope`),
    stage: "novo",
    deliveries: [1, 2, 3, 4].map((index) => t(`consultingTemplates.models.${id}.delivery${index}`)),
  };
}
const normalized = (title: string) =>
  title.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("pt-BR");
export function consultingDraftDeliveriesValid(titles: readonly string[]) {
  return (
    titles.length <= 20 &&
    titles.every((title) => title.trim().length >= 3 && title.trim().length <= 160) &&
    new Set(titles.map(normalized)).size === titles.length
  );
}
export function consultingDraftDeliveries(titles: readonly string[]) {
  if (!consultingDraftDeliveriesValid(titles)) throw new Error("CONSULTING_DELIVERIES_INVALID");
  return titles.map((title) => title.trim());
}

export function applyConsultingTemplate<
  T extends { title: string; description: string; stage: string },
>(current: T, template: ConsultingTemplateDraft) {
  return {
    form: {
      ...current,
      title: template.title,
      description: template.description,
      stage: template.stage,
    },
    deliveries: [...template.deliveries],
  };
}

/** A confirmed project is never recreated because its separate delivery request failed. */
export async function createProjectWithSuggestedDeliveries<T extends { id: string; code: string }>(
  create: () => Promise<T>,
  seed: (projectId: string, titles: string[]) => Promise<unknown>,
  titles: readonly string[],
) {
  const suggested = [...titles];
  const created = await create();
  let deliveriesConfirmed = true;
  if (suggested.length) {
    try {
      await seed(created.id, suggested);
    } catch {
      deliveriesConfirmed = false;
    }
  }
  return { created, deliveriesConfirmed };
}
