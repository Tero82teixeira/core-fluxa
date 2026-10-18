import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import i18n, { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shareMobileLink, type MobilePreview } from "@/lib/real-estate-mobile-actions";
import type { MobileSource } from "@/lib/real-estate-mobile";
export function MobileSelectionPreview({
  items,
  demo,
  onRemove,
}: {
  items: MobilePreview[];
  demo: boolean;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.mobile.${k}`);
  const locale = LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)];
  const money = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(n);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.property_id} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <strong>{item.code}</strong>
            <Button variant="ghost" className="min-h-11" onClick={() => onRemove(item.property_id)}>
              {l("remove")}
            </Button>
          </div>
          {item.listing ? (
            <>
              {item.listing.photos[0]?.url && (
                <img
                  src={item.listing.photos[0].url}
                  alt={
                    item.listing.photos[0].caption ||
                    (demo
                      ? t(`realEstateDemo.titles.${item.listing.title}`, {
                          defaultValue: item.listing.title,
                        })
                      : item.listing.title)
                  }
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              <p className="break-words font-semibold">
                {demo
                  ? t(`realEstateDemo.titles.${item.listing.title}`, {
                      defaultValue: item.listing.title,
                    })
                  : item.listing.title}
              </p>
              <p>
                {[item.listing.district, item.listing.city, item.listing.state]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {item.listing.sale_price !== null && (
                <p>
                  {l("sale")} · {money(item.listing.sale_price)}
                </p>
              )}
              {item.listing.rent_price !== null && (
                <p>
                  {l("rent")} · {money(item.listing.rent_price)}
                </p>
              )}
              <p className="text-sm">
                {t("realEstateDemo.mobile.specs", {
                  rooms: item.listing.bedrooms ?? "—",
                  parking: item.listing.parking ?? "—",
                  area: item.listing.area_m2 ?? "—",
                })}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {item.listing.description || (demo ? l("demoPropertyDescription") : "")}
              </p>
            </>
          ) : (
            <p className="text-sm text-destructive">{l("unpublished")}</p>
          )}
        </article>
      ))}
    </div>
  );
}
export function MobilePropertySelection({
  source,
  ids,
  onIds,
  demo,
}: {
  source: MobileSource;
  ids: string[];
  onIds: (ids: string[]) => void;
  demo: boolean;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.mobile.${k}`);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ signature: string; url: string } | null>(null);
  const active = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current++;
    };
  }, []);
  const signature = JSON.stringify([source.scope, ids]);
  const query = useQuery({
    queryKey: ["real-estate-mobile-selection", source.scope, ids],
    queryFn: () => source.preview(ids),
    enabled: !!ids.length,
    refetchInterval: 60_000,
  });
  if (!ids.length) return null;
  const eligible =
    !query.isError &&
    query.data?.length === ids.length &&
    query.data.every((i) => i.listing && i.token);
  const url = eligible && prepared?.signature === signature ? prepared.url : "";
  async function prepare() {
    const attempt = ++request.current;
    setBusy(true);
    setPrepared(null);
    try {
      const url = await source.share(ids, window.location.origin);
      if (active.current && request.current === attempt) setPrepared({ signature, url });
    } catch {
      if (active.current && request.current === attempt) {
        toast.error(l("selectionChanged"));
        void query.refetch();
      }
    } finally {
      if (active.current && request.current === attempt) setBusy(false);
    }
  }
  async function share() {
    const result = await shareMobileLink(url, l(demo ? "demoShareText" : "shareText"), navigator);
    if (result === "copied") toast.success(l("copied"));
    if (result === "manual") toast.info(l("copyManual"));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(l("copied"));
    } catch {
      toast.info(l("copyManual"));
    }
  }
  return (
    <section
      className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4"
      aria-label={l("selection")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {l("selection")} · {ids.length}/20
        </h3>
        <Button variant="ghost" className="min-h-11" onClick={() => onIds([])}>
          {l("clearSelection")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{l("publicOnly")}</p>
      {query.isLoading ? (
        <p role="status">{l("loading")}</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{l("selectionError")}</p>
          <Button variant="outline" className="min-h-12" onClick={() => void query.refetch()}>
            {l("retry")}
          </Button>
          {ids.map((id, index) => (
            <Button
              key={id}
              variant="ghost"
              className="min-h-12"
              onClick={() => onIds(ids.filter((i) => i !== id))}
            >
              {l("remove")} {index + 1}
            </Button>
          ))}
        </div>
      ) : (
        query.data && (
          <details>
            <summary className="min-h-12 cursor-pointer py-3">{l("previewSelection")}</summary>
            <MobileSelectionPreview
              items={query.data}
              demo={demo}
              onRemove={(id) => onIds(ids.filter((i) => i !== id))}
            />
          </details>
        )
      )}
      {!eligible && !query.isLoading && !query.isError && (
        <p role="status" className="text-sm text-destructive">
          {l("selectionUnavailable")}
        </p>
      )}
      <Button
        className="min-h-12 w-full whitespace-normal"
        disabled={!eligible || busy || query.isFetching}
        onClick={() => void prepare()}
      >
        {busy ? l("loading") : l("prepareLink")}
      </Button>
      {url && (
        <div className="space-y-3">
          <label className="block text-sm">
            {l("selectionLink")}
            <Input
              value={url}
              readOnly
              onFocus={(event) => event.target.select()}
              className="mt-2 min-h-12 text-base"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-12" onClick={() => void copy()}>
              {l("copy")}
            </Button>
            <Button className="min-h-12" onClick={() => void share()}>
              {l("share")}
            </Button>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center text-sm underline"
          >
            {l("previewLink")}
          </a>
        </div>
      )}
    </section>
  );
}
