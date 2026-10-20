import { useTranslation } from "react-i18next";
import { useMonthlyPlan } from "@/hooks/use-consulting-plans";
import type { ChecklistRow, ProcessRow } from "@/hooks/use-operations";
import { useWorkspace } from "@/lib/workspace";
import { civilDateKey, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConsultingSummaryCard } from "./consulting-summary-card";

export function ConsultingSummaryPanel({
  project,
  items,
  loading,
  failed,
  onRetry,
}: {
  project: ProcessRow;
  items: ChecklistRow[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { organizationId, membership } = useWorkspace();
  const today = civilDateKey();
  const plan = useMonthlyPlan(organizationId, project.id, today.slice(0, 7));
  if (failed || plan.isError)
    return (
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">{t("consultingSummary.title")}</h2>
        <p className="text-sm">{t("consultingSummary.unavailable")}</p>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            onRetry();
            void plan.refetch();
          }}
        >
          {t("consultingPlans.retry")}
        </Button>
      </section>
    );
  if (loading || !plan.isSuccess)
    return (
      <p className="p-4 text-sm" role="status">
        {t("consultingSummary.loading")}
      </p>
    );
  const org = membership?.organizations;
  return (
    <ConsultingSummaryCard
      input={{
        company: org?.trade_name || org?.legal_name || "",
        client: project.clients?.name ?? "",
        code: project.code,
        stage: t(`consultingSummary.stages.${project.stage}`),
        title: project.title,
        description: project.description,
        owner_name: project.owner_name,
        due_date: project.due_date,
        return_on: plan.data?.plan?.status === "ativo" ? plan.data.plan.return_on : null,
        today,
        deliveries: items,
      }}
      formatDate={formatDate}
    />
  );
}
