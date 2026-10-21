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
  canEdit,
}: {
  organizationId: string;
  clientId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
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
      canEdit={canEdit}
      formatDate={formatDate}
      onSave={async (values) => {
        if (!canEdit) throw new Error("NO_PERMISSION");
        await save.mutateAsync({ values, revision: record?.revision ?? null });
      }}
    />
  );
}
