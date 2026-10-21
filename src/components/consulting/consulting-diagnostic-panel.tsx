import { Link } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace";
import { routeVisibleForModules } from "@/lib/organization-segments";
import { ConsultingProposalPreparation } from "./consulting-proposal-preparation";
import { useSaveCommercialProposal } from "@/hooks/use-commercial-proposals";
import { consultingProposalInput } from "@/lib/consulting-proposal";
import { useTranslation } from "react-i18next";
import { ConsultingDiagnosticCard } from "./consulting-diagnostic-card";
import {
  useConsultingDiagnostic,
  useSaveConsultingDiagnostic,
} from "@/hooks/use-consulting-diagnostic";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
export function ConsultingDiagnosticPanel({
  organizationId,
  clientId,
  clientName,
  canEdit,
}: {
  organizationId: string;
  clientId: string;
  clientName: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { membership } = useWorkspace();
  const settings = membership?.organizations?.organization_settings;
  const canPrepare =
    canEdit &&
    settings?.business_segment === "consulting_services" &&
    routeVisibleForModules("/relatorios", settings.business_segment, settings.enabled_modules);
  const createProposal = useSaveCommercialProposal(organizationId);
  // Match the existing commercial form/API minimum day; never convert a chosen due date.
  const today = new Date().toISOString().slice(0, 10);
  const query = useConsultingDiagnostic(organizationId, clientId);
  const save = useSaveConsultingDiagnostic(organizationId, clientId);
  if (query.isPending || (query.isError && query.data === undefined))
    return (
      <section
        className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6"
        aria-busy={query.isPending}
      >
        <h2 className="text-lg font-semibold">{t("consultingDiagnostic.title")}</h2>
        <p role={query.isError ? "alert" : "status"} className="text-sm text-muted-foreground">
          {t(query.isError ? "consultingDiagnostic.loadError" : "consultingDiagnostic.loading")}
        </p>
        {query.isError && (
          <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t("consultingDiagnostic.retry")}
          </Button>
        )}
      </section>
    );
  const record = query.data;
  return (
    <ConsultingDiagnosticCard
      key={`${organizationId}:${clientId}`}
      values={
        record
          ? {
              focus: record.focus,
              situation: record.situation,
              attempts: record.attempts,
              expected_result: record.expected_result,
              priority: record.priority,
              target_on: record.target_on ?? "",
            }
          : null
      }
      after={
        canPrepare && record ? (
          <ConsultingProposalPreparation
            key={`${organizationId}:${clientId}`}
            expectedResult={record.expected_result}
            clientName={clientName}
            today={today}
            disabled={query.isFetching || query.isError}
            viewProposals={
              <Button asChild className="min-h-11" variant="outline">
                <Link to="/relatorios" search={{ tipo: "commercial" }}>
                  {t("consultingProposal.view")}
                </Link>
              </Button>
            }
            onSave={async (draft) => {
              if (!canPrepare) throw new Error("NO_PERMISSION");
              const id = await createProposal.mutateAsync(
                consultingProposalInput(draft, { id: clientId, name: clientName }, today),
              );
              if (
                typeof id !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
              )
                throw new Error("CONSULTING_PROPOSAL_NOT_CONFIRMED");
            }}
          />
        ) : undefined
      }
      canEdit={canEdit}
      formatDate={formatDate}
      onSave={async (values) => {
        if (!canEdit) throw new Error("NO_PERMISSION");
        await save.mutateAsync({ values, revision: record?.revision ?? null });
      }}
    />
  );
}
