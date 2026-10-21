import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { useConsultingProposalSource } from "@/hooks/use-consulting-proposal-source";
import { ConsultingProposalSourceCard } from "./consulting-proposal-source-card";
import { Button } from "@/components/ui/button";
import type { ProcessRow } from "@/hooks/use-operations";
export function ConsultingProjectSource({ project }: { project: ProcessRow }) {
  const { t } = useTranslation(),
    { membership, organizationId } = useWorkspace(),
    permissions = usePermissions();
  const settings = membership?.organizations?.organization_settings;
  const enabled = Boolean(
    project.source_commercial_proposal_id &&
    organizationId === project.organization_id &&
    permissions.canViewReports &&
    routeVisibleForModules("/relatorios", settings?.business_segment, settings?.enabled_modules),
  );
  const source = useConsultingProposalSource(
    organizationId,
    project.source_commercial_proposal_id,
    enabled,
  );
  if (!enabled) return null;
  if (source.isPending || source.isError || !source.data)
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">{t("consultingSource.linked")}</h2>
        <p role={source.isError ? "alert" : "status"} className="text-sm text-muted-foreground">
          {t(source.isPending ? "consultingSource.loading" : "consultingSource.unavailable")}
        </p>
        {source.isError && (
          <Button className="min-h-11" variant="outline" onClick={() => void source.refetch()}>
            {t("consultingSource.retry")}
          </Button>
        )}
      </section>
    );
  return <ConsultingProposalSourceCard source={source.data} />;
}
