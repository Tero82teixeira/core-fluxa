import type { TFunction } from "i18next";
import { consultingDeliveryProgress, type ConsultingDeliveryStatus } from "./consulting-project.ts";

type SummaryDelivery = {
  title: string;
  status: ConsultingDeliveryStatus;
  assignee_name: string | null;
  due_date: string | null;
};
export type ConsultingSummaryInput = {
  company: string;
  client: string;
  code: string;
  stage: string;
  title: string | null;
  description: string | null;
  owner_name: string | null;
  due_date: string | null;
  return_on: string | null;
  today: string;
  demo?: boolean;
  deliveries: readonly SummaryDelivery[];
};

/** Explicit client-facing fields only: never spread database rows into an export. */
export function buildConsultingSummary(input: ConsultingSummaryInput) {
  const deliveries = input.deliveries.map((item) => ({
    title: item.title,
    status: item.status,
    assignee_name: item.assignee_name ?? "",
    due_date: item.due_date ?? "",
  }));
  const pending = deliveries
    .filter((item) => item.status !== "aprovado")
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  return {
    company: input.company,
    client: input.client,
    code: input.code,
    stage: input.stage,
    title: input.title ?? "",
    scope: input.description ?? "",
    owner: input.owner_name ?? "",
    due: input.due_date ?? "",
    returnOn: input.return_on ?? "",
    today: input.today,
    demo: Boolean(input.demo),
    progress: consultingDeliveryProgress(deliveries, input.today),
    done: deliveries.filter((item) => item.status === "aprovado"),
    pending,
  };
}
export type ConsultingSummary = ReturnType<typeof buildConsultingSummary>;
export type SummarySection = { title: string; lines: string[] };

/** The preview and PDF share the same translated, complete snapshot. */
export function consultingSummaryDocument(
  summary: ConsultingSummary,
  t: TFunction,
  formatDate: (value: string) => string,
) {
  const empty = t("consultingProject.empty");
  const field = (key: string, value: string) => `${t(key)}: ${value || empty}`;
  const date = (value: string) => (value ? formatDate(value) : empty);
  const delivery = (item: SummaryDelivery) =>
    [
      item.title,
      field("consultingProject.status", t(`consultingProject.statuses.${item.status}`)),
      field("consultingProject.owner", item.assignee_name ?? ""),
      field("consultingProject.due", date(item.due_date ?? "")),
      ...(item.status !== "aprovado" && item.due_date && item.due_date < summary.today
        ? [t("consultingProject.overdue")]
        : []),
    ].join(" | ");
  const sections: SummarySection[] = [
    {
      title: t("consultingSummary.project"),
      lines: [
        field("consultingSummary.company", summary.company),
        field("consultingSummary.client", summary.client),
        field("consultingSummary.code", summary.code),
        field("consultingProject.status", summary.stage),
        field("consultingProject.objective", summary.title),
        field("consultingProject.scope", summary.scope),
        field("consultingProject.owner", summary.owner),
        field("consultingProject.due", date(summary.due)),
        field("consultingSummary.returnOn", date(summary.returnOn)) +
          (summary.returnOn && summary.returnOn <= summary.today
            ? ` - ${t("consultingSummary.returnDue")}`
            : ""),
      ],
    },
    {
      title: t("consultingSummary.pending"),
      lines: summary.pending.length
        ? summary.pending.map(delivery)
        : [t("consultingSummary.noPending")],
    },
    {
      title: t("consultingSummary.done"),
      lines: summary.done.length ? summary.done.map(delivery) : [t("consultingSummary.noDone")],
    },
  ];
  return {
    title: t("consultingSummary.title"),
    reference: t("consultingSummary.reference", { date: formatDate(summary.today) }),
    progress: t("consultingProject.progress", summary.progress),
    notice: t(summary.demo ? "consultingSummary.demo" : "consultingSummary.snapshot"),
    statusHint: t("consultingSummary.statusHint"),
    sections,
  };
}
export type ConsultingSummaryDocument = ReturnType<typeof consultingSummaryDocument>;
