import "@/i18n";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ConsultingProposalSource } from "@/lib/consulting-project-source";
export function ConsultingProposalSourceCard({
  source,
  review = false,
}: {
  source: Pick<
    ConsultingProposalSource,
    "proposal_number" | "title" | "service_description" | "terms" | "archived_at"
  >;
  review?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border bg-card p-4 sm:p-6">
      <h2 className="break-words font-semibold">
        {t("consultingSource.reference", { number: source.proposal_number })}
      </h2>
      {review && (
        <p className="text-sm text-muted-foreground">{t("consultingSource.reviewHint")}</p>
      )}
      {review && source.title.trim().length > 160 && (
        <p className="text-sm text-muted-foreground">{t("consultingSource.shortTitle")}</p>
      )}
      <details className="min-w-0">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
          {t("consultingSource.consult")}
        </summary>
        <dl className="space-y-4 text-sm">
          {(
            [
              ["title", source.title],
              ["scope", source.service_description],
              ["terms", source.terms],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{t(`consultingSource.${key}`)}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">
                {value || t("consultingProject.empty")}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      {source.archived_at && (
        <p className="text-sm text-muted-foreground">{t("consultingSource.archived")}</p>
      )}
    </section>
  );
}
export function ConsultingProposalSourceStatus({
  status,
  onRetry,
  onBack,
}: {
  status: "loading" | "error" | "invalid";
  onRetry?: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border bg-card p-4 sm:p-6"
      aria-busy={status === "loading"}
    >
      <h1 className="text-lg font-semibold">{t("consultingSource.preparing")}</h1>
      <p role={status === "loading" ? "status" : "alert"} className="text-sm text-muted-foreground">
        {t(`consultingSource.${status}`)}
      </p>
      <div className="flex flex-wrap gap-2">
        {status === "error" && onRetry && (
          <Button className="min-h-11" variant="outline" onClick={onRetry}>
            {t("consultingSource.retry")}
          </Button>
        )}
        <Button className="min-h-11" variant="outline" onClick={onBack}>
          {t("consultingSource.back")}
        </Button>
      </div>
    </section>
  );
}
