import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMMERCIAL_METRICS,
  COMMERCIAL_ORIGINS,
  COMMERCIAL_REASONS,
  validCommercialDates,
  type CommercialFilters,
  type CommercialSummary,
  type CommercialMetric,
} from "@/lib/real-estate-commercial";
export function CommercialFilterForm({
  initial,
  responsibles,
  busy,
  onApply,
}: {
  initial: CommercialFilters;
  responsibles: { id: string; name: string }[];
  busy: boolean;
  onApply: (f: CommercialFilters) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (key: string) => t(`realEstateDemo.commercial.${key}`);
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validCommercialDates(draft.date_from, draft.date_to)) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        onApply({ ...draft, metric: "received", origin: "", closure_reason: "" });
      }}
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <Label className="block min-w-0 space-y-2">
          {l("from")}
          <Input
            required
            type="date"
            value={draft.date_from}
            onChange={(e) => setDraft({ ...draft, date_from: e.target.value })}
          />
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("to")}
          <Input
            required
            type="date"
            value={draft.date_to}
            onChange={(e) => setDraft({ ...draft, date_to: e.target.value })}
          />
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("responsible")}
          <select
            className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
            value={draft.responsible}
            onChange={(e) => setDraft({ ...draft, responsible: e.target.value })}
          >
            <option value="">{l("all")}</option>
            <option value="unassigned">{l("noResponsible")}</option>
            {responsibles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        {l("periodHint")} · {initial.timezone}
      </p>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {l("invalid")}
        </p>
      )}
      <Button disabled={busy}>{l("apply")}</Button>
    </form>
  );
}
export function CommercialPanel({
  data,
  filters,
  onQueue,
}: {
  data: CommercialSummary;
  filters: CommercialFilters;
  onQueue: (f: CommercialFilters) => void;
}) {
  const { t, i18n: language } = useTranslation(undefined, { i18n });
  const l = (key: string) => t(`realEstateDemo.commercial.${key}`);
  const open = (metric: CommercialMetric, origin = "", closure_reason = "") =>
    onQueue({ ...filters, metric, origin, closure_reason });
  const metricButton = (key: CommercialMetric, value: number, origin = "") => (
    <button
      type="button"
      disabled={!value}
      onClick={() => open(key, origin)}
      className="min-h-24 min-w-0 rounded-xl border bg-card p-4 text-left transition hover:border-primary disabled:cursor-default disabled:opacity-70"
    >
      <span className="block text-sm text-muted-foreground">{l(key)}</span>
      <strong className="mt-2 block text-2xl tabular-nums">
        {value.toLocaleString(language.resolvedLanguage)}
      </strong>
      <span className="mt-2 block text-xs text-muted-foreground">{l("openQueue")}</span>
    </button>
  );
  return (
    <section className="min-w-0 space-y-5">
      <p className="text-sm text-muted-foreground">{l("definition")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COMMERCIAL_METRICS.map((key) => (
          <div key={key} className="grid">
            {metricButton(key, data.totals[key])}
          </div>
        ))}
      </div>
      {!data.totals.received && (
        <p className="rounded-xl border border-dashed p-4 text-sm">{l("empty")}</p>
      )}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">{l("channels")}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {COMMERCIAL_ORIGINS.map((origin) => {
            const row = data.channels.find((c) => c.origin === origin);
            return (
              <article key={origin} className="min-w-0 space-y-3 rounded-xl border p-4">
                <h4 className="font-semibold">{t(`realEstateDemo.manual.${origin}`)}</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(["received", "active", "closed"] as const).map((key) => (
                    <button
                      type="button"
                      key={key}
                      disabled={!row?.[key]}
                      onClick={() => open(key, origin)}
                      className="min-h-16 rounded-lg bg-muted p-3 text-left hover:bg-muted/70 disabled:cursor-default"
                    >
                      <span className="block text-xs text-muted-foreground">{l(key)}</span>
                      <strong>{row?.[key] || 0}</strong>
                    </button>
                  ))}
                </div>
                <p className="text-sm font-medium">{l("outcomes")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {COMMERCIAL_REASONS.map((reason) => (
                    <button
                      type="button"
                      key={reason}
                      disabled={!row?.[reason]}
                      onClick={() => open("closed", origin, reason)}
                      className="min-h-14 rounded-lg border p-2 text-left hover:bg-muted disabled:cursor-default"
                    >
                      <span className="block text-xs text-muted-foreground">
                        {reason === "legacy" ? l("legacy") : t(`realEstateDemo.manual.${reason}`)}
                      </span>
                      <strong>{row?.[reason] || 0}</strong>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {l("asOf")}:{" "}
        {new Date(data.as_of).toLocaleString(language.resolvedLanguage, {
          timeZone: filters.timezone,
        })}{" "}
        · {filters.timezone}
      </p>
    </section>
  );
}
export function CommercialQueueNotice({
  filters,
  onClear,
  responsibleLabel,
}: {
  filters: CommercialFilters;
  onClear: () => void;
  responsibleLabel?: string;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.commercial.${k}`);
  return (
    <div className="space-y-2 rounded-xl bg-muted p-3 text-sm">
      <p>
        {l("queueScope")} {filters.date_from} – {filters.date_to} · {filters.timezone}
      </p>
      <p>
        {l(filters.metric || "received")}
        {filters.origin && ` · ${t(`realEstateDemo.manual.${filters.origin}`)}`}
        {filters.closure_reason &&
          ` · ${filters.closure_reason === "legacy" ? l("legacy") : t(`realEstateDemo.manual.${filters.closure_reason}`)}`}
        {filters.responsible &&
          ` · ${filters.responsible === "unassigned" ? l("noResponsible") : responsibleLabel || l("selectedResponsible")}`}
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>
        {l("clearQueueFilters")}
      </Button>
    </div>
  );
}
