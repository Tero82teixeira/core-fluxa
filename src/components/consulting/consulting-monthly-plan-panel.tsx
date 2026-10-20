import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConsultingMonthlyPlanCard } from "./consulting-monthly-plan-card";
import {
  useMonthlyPlan,
  useSaveMonthlyPlan,
  useGeneratePlanMonth,
} from "@/hooks/use-consulting-plans";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProcessRow } from "@/hooks/use-operations";
export function ConsultingMonthlyPlanPanel({
  project,
  canEdit,
  canManageTasks,
}: {
  project: ProcessRow;
  canEdit: boolean;
  canManageTasks: boolean;
}) {
  const { t } = useTranslation(),
    { organizationId, membership } = useWorkspace();
  const settings = membership?.organizations?.organization_settings;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const query = useMonthlyPlan(organizationId, project.id, month),
    save = useSaveMonthlyPlan(organizationId, project.id),
    generate = useGeneratePlanMonth(organizationId, project.id);
  if (query.isPending) return <p className="p-4 text-sm">{t("consultingPlans.loading")}</p>;
  if (query.isError)
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p>{t("consultingPlans.unavailable")}</p>
        <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
          {t("consultingPlans.retry")}
        </Button>
      </div>
    );
  if (!query.data) return null;
  return (
    <ConsultingMonthlyPlanCard
      workspace={query.data}
      canEdit={canEdit && !project.archived_at}
      canGenerate={
        canManageTasks &&
        !project.archived_at &&
        !["finalizado", "arquivado", "cancelado"].includes(project.stage) &&
        routeVisibleForModules("/tarefas", settings?.business_segment, settings?.enabled_modules)
      }
      month={month}
      onMonth={(value) => {
        if (/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value)) setMonth(value);
      }}
      onSave={async (values, revision) => {
        await save.mutateAsync({ values, revision });
      }}
      onGenerate={() => generate.mutateAsync(month)}
      formatDate={formatDate}
      money={formatCurrency}
      initialTitle={project.title ?? ""}
      today={today}
    />
  );
}
