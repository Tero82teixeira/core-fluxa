import "@/i18n";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { monthlyPlanAttention, type PlanOverview } from "@/lib/consulting-plans";
export function ConsultingPlansList({
  data,
  page,
  onPage,
  onOpen,
  formatDate,
  money,
}: {
  data: PlanOverview;
  page: number;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
  formatDate: (value: string) => string;
  money: (value: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("consultingPlans.overview")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["ending", "expired", "returns"] as const).map((key) => (
          <div key={key} className="rounded-xl bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">{t(`consultingPlans.metrics.${key}`)}</p>
            <strong className="text-2xl">{data[key]}</strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("consultingPlans.overviewHint")}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.items.map((plan) => {
          const attention = monthlyPlanAttention(plan, data.today);
          return (
            <article key={plan.process_id} className="space-y-2 rounded-xl border p-4">
              <h3 className="break-words font-medium">{plan.service_name}</h3>
              <p className="break-words text-sm text-muted-foreground">
                {plan.client_name} · {plan.code}
              </p>
              <p className="text-sm font-semibold">
                {money(plan.monthly_amount)}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("consultingPlans.perMonth")}
                </span>
              </p>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t("consultingPlans.starts_on")}
                  </dt>
                  <dd>{formatDate(plan.starts_on)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("consultingPlans.ends_on")}</dt>
                  <dd>{formatDate(plan.ends_on)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    {t("consultingPlans.return_on")}
                  </dt>
                  <dd>
                    {plan.return_on ? formatDate(plan.return_on) : t("consultingProject.empty")}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-1">
                  {t(`consultingPlans.statuses.${plan.status}`)}
                </span>
                {attention.ending && (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                    {t("consultingPlans.ending")}
                  </span>
                )}
                {attention.expired && (
                  <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">
                    {t("consultingPlans.expired")}
                  </span>
                )}
                {attention.returnDue && (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                    {t("consultingPlans.returnDue")}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => onOpen(plan.process_id)}
              >
                {t("consultingPlans.open")}
              </Button>
            </article>
          );
        })}
      </div>
      {!data.total && (
        <p className="text-sm text-muted-foreground">{t("consultingPlans.noPlans")}</p>
      )}
      {data.total > 10 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="min-h-11"
            variant="outline"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            {t("consultingPlans.previous")}
          </Button>
          <span className="text-sm">
            {page + 1} / {Math.ceil(data.total / 10)}
          </span>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={(page + 1) * 10 >= data.total}
            onClick={() => onPage(page + 1)}
          >
            {t("consultingPlans.next")}
          </Button>
        </div>
      )}
    </section>
  );
}
