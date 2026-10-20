import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useConsultingDay } from "@/hooks/use-consulting-day";
import { useWorkspace } from "@/lib/workspace";
import { navItemVisibleForRole } from "@/lib/navigation";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { formatDate } from "@/lib/format";
import { CONSULTING_DAY_PAGE_SIZE, type ConsultingDayKind } from "@/lib/consulting-day";
import { ConsultingDayCard } from "./consulting-day-card";
import { Button } from "@/components/ui/button";

export function ConsultingDayOverview() {
  const { organizationId, membership, role } = useWorkspace();
  const { t } = useTranslation(),
    navigate = useNavigate();
  const [kind, setKind] = useState<ConsultingDayKind>("delivery"),
    [page, setPage] = useState(0);
  const settings = membership?.organizations?.organization_settings;
  const allowed =
    settings?.business_segment === "consulting_services" &&
    navItemVisibleForRole("/processos", role) &&
    routeVisibleForModules("/processos", settings.business_segment, settings.enabled_modules);
  const query = useConsultingDay(organizationId, kind, page, allowed);
  useEffect(() => {
    if (
      query.isSuccess &&
      !query.isPlaceholderData &&
      query.data.kind === kind &&
      query.data.page === page
    ) {
      const last = Math.max(0, Math.ceil(query.data.total / CONSULTING_DAY_PAGE_SIZE) - 1);
      if (page > last) setPage(last);
    }
  }, [query.data, query.isSuccess, query.isPlaceholderData, kind, page]);
  if (!allowed) return null;
  if (query.isError)
    return (
      <section className="space-y-3 rounded-2xl border p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t("consultingDay.title")}</h2>
        <p className="text-sm">{t("consultingDay.unavailable")}</p>
        <Button className="min-h-11" variant="outline" onClick={() => void query.refetch()}>
          {t("consultingPlans.retry")}
        </Button>
      </section>
    );
  if (!query.data)
    return (
      <p className="p-4 text-sm" role="status">
        {t("consultingDay.loading")}
      </p>
    );
  return (
    <ConsultingDayCard
      data={query.data}
      kind={kind}
      page={page}
      busy={query.isFetching}
      onKind={(value) => {
        setKind(value);
        setPage(0);
      }}
      onPage={setPage}
      onOpen={(id) => void navigate({ to: "/processos/$processId", params: { processId: id } })}
      onRefresh={() => void query.refetch()}
      formatDate={formatDate}
    />
  );
}
