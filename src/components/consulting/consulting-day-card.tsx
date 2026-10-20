import "@/i18n";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  CONSULTING_DAY_KINDS,
  CONSULTING_DAY_PAGE_SIZE,
  type ConsultingDay,
  type ConsultingDayKind,
} from "@/lib/consulting-day";

export function ConsultingDayCard({
  data,
  kind,
  page,
  busy = false,
  onKind,
  onPage,
  onOpen,
  onRefresh,
  formatDate,
}: {
  data: ConsultingDay;
  kind: ConsultingDayKind;
  page: number;
  busy?: boolean;
  onKind: (kind: ConsultingDayKind) => void;
  onPage: (page: number) => void;
  onOpen: (processId: string) => void;
  onRefresh?: () => void;
  formatDate: (value: string) => string;
}) {
  const { t } = useTranslation();
  const ready = data.kind === kind && data.page === page;
  const total = ready ? data.total : data.counts[kind];
  const pages = Math.max(1, Math.ceil(data.total / CONSULTING_DAY_PAGE_SIZE));
  return (
    <section
      className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-6"
      aria-label={t("consultingDay.title")}
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("consultingDay.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("consultingDay.range", {
              today: formatDate(data.today),
              horizon: formatDate(data.horizon),
            })}
          </p>
        </div>
        {onRefresh && (
          <Button variant="outline" className="min-h-11" onClick={onRefresh} disabled={busy}>
            {t("consultingDay.refresh")}
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3" aria-label={t("consultingDay.filters")}>
        {CONSULTING_DAY_KINDS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={kind === key}
            disabled={busy}
            className={`min-h-16 min-w-0 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 ${kind === key ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
            onClick={() => onKind(key)}
          >
            <span className="block break-words text-sm">{t(`consultingDay.kinds.${key}`)}</span>
            <strong className="mt-1 block text-2xl">{data.counts[key]}</strong>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("consultingDay.hint")}</p>
      <div aria-live="polite" className="space-y-3">
        <h3 className="font-medium">
          {t(`consultingDay.kinds.${kind}`)} · {total}
        </h3>
        {!ready && (
          <p role="status" className="text-sm">
            {t("consultingDay.loading")}
          </p>
        )}
        {ready &&
          data.items.map((item) => (
            <article key={item.id} className="min-w-0 space-y-2 rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">
                {item.code} · <span className="[overflow-wrap:anywhere]">{item.client_name}</span>
              </p>
              <h4 className="[overflow-wrap:anywhere] font-medium">{item.title}</h4>
              {kind !== "project" && (
                <p className="[overflow-wrap:anywhere] text-sm text-muted-foreground">
                  {item.project_title}
                </p>
              )}
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <span>
                  {t(kind === "followup" ? "consultingSummary.returnOn" : "consultingProject.due")}:{" "}
                  {formatDate(item.due_date)}
                </span>
                <span
                  className={
                    item.due_date < data.today
                      ? "font-medium text-destructive"
                      : "font-medium text-primary"
                  }
                >
                  {t(
                    item.due_date < data.today
                      ? "consultingDay.overdue"
                      : item.due_date === data.today
                        ? "consultingDay.today"
                        : "consultingDay.upcoming",
                  )}
                </span>
              </p>
              <Button
                className="min-h-11 w-full sm:w-auto"
                variant="outline"
                disabled={busy}
                onClick={() => onOpen(item.process_id)}
              >
                {t("consultingDay.open")}
              </Button>
            </article>
          ))}
        {ready && data.items.length === 0 && (
          <p className="rounded-xl bg-muted/40 p-4 text-sm">{t(`consultingDay.empty.${kind}`)}</p>
        )}
      </div>
      {ready && data.total > CONSULTING_DAY_PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy || page === 0}
            onClick={() => onPage(page - 1)}
          >
            {t("consultingDay.previous")}
          </Button>
          <span className="text-sm">{t("consultingDay.page", { page: page + 1, pages })}</span>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy || page + 1 >= pages}
            onClick={() => onPage(page + 1)}
          >
            {t("consultingDay.next")}
          </Button>
        </div>
      )}
    </section>
  );
}
