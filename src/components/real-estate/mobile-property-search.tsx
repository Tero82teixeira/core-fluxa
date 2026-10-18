import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import i18n, { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirectClientVoice } from "./direct-client-voice";
import { MobilePropertySelection } from "./mobile-property-selection";
import type { VoiceCriteria } from "@/lib/real-estate-voice";
import { parseVoiceCriteria } from "@/lib/real-estate-voice";
import { emptyMobileFilters, needsMobilePurpose } from "@/lib/real-estate-mobile-actions";
import type { MobileSource } from "@/lib/real-estate-mobile";
const selectClass = "min-h-12 w-full rounded-lg border bg-background px-3 text-base";
export function MobilePropertySearch({
  source,
  filters,
  onFilters,
  ids,
  onIds,
  demo,
}: {
  source: MobileSource;
  filters: VoiceCriteria;
  onFilters: (filters: VoiceCriteria) => void;
  ids: string[];
  onIds: (ids: string[]) => void;
  demo: boolean;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.mobile.${k}`);
  const locale = LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)];
  const money = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(n);
  const [draft, setDraft] = useState(filters);
  const [page, setPage] = useState(1);
  const needsPurpose = needsMobilePurpose(filters);
  const query = useQuery({
    queryKey: ["real-estate-mobile-properties", source.scope, filters, page],
    queryFn: () => source.properties(filters, page),
    enabled: !needsPurpose,
  });
  function toggle(id: string) {
    if (ids.includes(id)) onIds(ids.filter((i) => i !== id));
    else if (ids.length < 20) onIds([...ids, id]);
    else toast.info(l("selectionLimit"));
  }
  const summary = [
    filters.type ? l(`types.${filters.type}`) : "",
    filters.purpose ? l(filters.purpose === "locacao" ? "rent" : "sale") : "",
    filters.search,
    filters.maxPrice === null ? "" : `${l("budget")} ${money(filters.maxPrice)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{l("properties")}</h2>
      <DirectClientVoice mode="property" onSearch={(text) => onFilters(parseVoiceCriteria(text))} />
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onFilters(draft);
          setPage(1);
        }}
      >
        <div className="flex gap-2">
          <Input
            aria-label={l("properties")}
            placeholder={l("propertySearch")}
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            maxLength={100}
            className="min-h-12 min-w-0 text-base"
          />
          <Button type="submit" className="min-h-12">
            {l("search")}
          </Button>
        </div>
        <details className="rounded-xl border p-3">
          <summary className="min-h-11 cursor-pointer py-2">{l("filters")}</summary>
          <div className="space-y-3 pt-2">
            <label className="block text-sm">
              {l("propertyType")}
              <select
                value={draft.type}
                className={selectClass}
                onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              >
                <option value="">{l("allTypes")}</option>
                {["casa", "apartamento", "terreno", "comercial", "rural", "outro"].map((type) => (
                  <option key={type} value={type}>
                    {l(`types.${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              {l("purpose")}
              <select
                value={draft.purpose}
                className={selectClass}
                onChange={(event) => setDraft({ ...draft, purpose: event.target.value })}
              >
                <option value="">{l("allPurposes")}</option>
                <option value="locacao">{l("rent")}</option>
                <option value="venda">{l("sale")}</option>
              </select>
            </label>
            <label className="block text-sm">
              {l("maxPrice")}
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="999999999999"
                step="0.01"
                value={draft.maxPrice ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    maxPrice: event.target.value ? Number(event.target.value) : null,
                  })
                }
                className="min-h-12 text-base"
              />
            </label>
            <Button type="submit" className="min-h-12 w-full">
              {l("applyFilters")}
            </Button>
          </div>
        </details>
      </form>
      {summary && (
        <div className="space-y-1 rounded-xl bg-muted p-3">
          <p className="break-words text-sm" role="status">
            {summary}
          </p>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => onFilters(emptyMobileFilters())}
          >
            {l("clearFilters")}
          </Button>
        </div>
      )}
      {needsPurpose && (
        <div className="space-y-3 rounded-xl border p-4" role="status">
          <p>{l("choosePurpose")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="min-h-12"
              onClick={() => onFilters({ ...filters, purpose: "locacao" })}
            >
              {l("rent")}
            </Button>
            <Button
              variant="outline"
              className="min-h-12"
              onClick={() => onFilters({ ...filters, purpose: "venda" })}
            >
              {l("sale")}
            </Button>
          </div>
        </div>
      )}
      <MobilePropertySelection
        key={JSON.stringify([source.scope, ids])}
        source={source}
        ids={ids}
        onIds={onIds}
        demo={demo}
      />
      {!needsPurpose &&
        (query.isLoading ? (
          <p role="status">{l("loading")}</p>
        ) : query.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border p-4">
            <p>{l("error")}</p>
            <Button variant="outline" className="min-h-12" onClick={() => void query.refetch()}>
              {l("retry")}
            </Button>
          </div>
        ) : (
          <>
            {!query.data?.items.length && (
              <p className="rounded-xl border p-4">{l("emptyProperties")}</p>
            )}
            {query.data?.items.map((property) => (
              <article key={property.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  {property.code} ·{" "}
                  {t(`realEstateDemo.mobile.status.${property.status}`, {
                    defaultValue: property.status,
                  })}
                </p>
                <h3 className="break-words text-lg font-semibold">
                  {demo
                    ? t(`realEstateDemo.titles.${property.title}`, { defaultValue: property.title })
                    : property.title}
                </h3>
                <p>
                  {[property.district, property.city, property.state].filter(Boolean).join(" · ")}
                </p>
                {property.sale_price !== null && filters.purpose !== "locacao" && (
                  <p>
                    {l("sale")} · {money(property.sale_price)}
                  </p>
                )}
                {property.rent_price !== null && filters.purpose !== "venda" && (
                  <p>
                    {l("rent")} · {money(property.rent_price)}
                  </p>
                )}
                <Button
                  className="min-h-12 w-full whitespace-normal"
                  variant={ids.includes(property.id) ? "default" : "outline"}
                  aria-pressed={ids.includes(property.id)}
                  disabled={
                    !ids.includes(property.id) &&
                    !["disponivel", "reservado"].includes(property.status)
                  }
                  onClick={() => toggle(property.id)}
                >
                  {ids.includes(property.id) ? l("removeSelection") : l("selectProperty")}
                </Button>
              </article>
            ))}
            {(query.data?.total ?? 0) > 20 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  className="min-h-12"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {l("previous")}
                </Button>
                <span>
                  {page} / {Math.ceil((query.data?.total ?? 0) / 20)}
                </span>
                <Button
                  className="min-h-12"
                  variant="outline"
                  disabled={page * 20 >= (query.data?.total ?? 0)}
                  onClick={() => setPage(page + 1)}
                >
                  {l("next")}
                </Button>
              </div>
            )}
          </>
        ))}
    </section>
  );
}
