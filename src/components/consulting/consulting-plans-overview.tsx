import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/lib/workspace";
import { navItemVisibleForRole } from "@/lib/navigation";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { useMonthlyPlansOverview } from "@/hooks/use-consulting-plans";
import { ConsultingPlansList } from "./consulting-plans-list";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/format";
export function ConsultingPlansOverview() {
  const { t } = useTranslation(),
    navigate = useNavigate(),
    { organizationId, membership, role } = useWorkspace();
  const settings = membership?.organizations?.organization_settings,
    [page, setPage] = useState(0);
  const allowed =
    settings?.business_segment === "consulting_services" &&
    navItemVisibleForRole("/processos", role) &&
    routeVisibleForModules("/processos", settings.business_segment, settings.enabled_modules);
  const query = useMonthlyPlansOverview(organizationId, page, allowed);
  if (!allowed) return null;
  if (query.isPending) return <p className="p-4 text-sm">{t("consultingPlans.loading")}</p>;
  if (query.isError)
    return (
      <section className="space-y-3 rounded-xl border p-4">
        <h2>{t("consultingPlans.overview")}</h2>
        <p className="text-sm">{t("consultingPlans.unavailable")}</p>
        <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
          {t("consultingPlans.retry")}
        </Button>
      </section>
    );
  return query.data ? (
    <details className="rounded-2xl border bg-card p-4 sm:p-6">
      <summary className="min-h-11 cursor-pointer content-center font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        {t("consultingPlans.overview")}
      </summary>
      <div className="mt-4">
        <ConsultingPlansList
          data={query.data}
          page={page}
          onPage={setPage}
          formatDate={formatDate}
          money={formatCurrency}
          onOpen={(id) => void navigate({ to: "/processos/$processId", params: { processId: id } })}
        />
      </div>
    </details>
  ) : null;
}
