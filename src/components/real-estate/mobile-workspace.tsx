import { MobilePropertySearch } from "./mobile-property-search";
import { emptyMobileFilters, mobileCommand } from "@/lib/real-estate-mobile-actions";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Users, ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirectClientVoice } from "./direct-client-voice";
import {
  mobileContact,
  uniqueMobileClient,
  mobileDay,
  type MobileClient,
  type MobilePage,
  type MobileSource,
  type MobileSummary,
} from "@/lib/real-estate-mobile";
const card = "rounded-2xl border bg-card p-4 space-y-3";
export function MobileClientSummary({
  data,
  demo = false,
}: {
  data: MobileSummary;
  demo?: boolean;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (key: string) => t(`realEstateDemo.mobile.${key}`);
  const locale = LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)];
  const phone = mobileContact(data.client.phone);
  const whatsapp = mobileContact(data.client.whatsapp || data.client.phone);
  const money = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(amount);
  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="break-words text-2xl font-semibold">{data.client.name}</h2>
        <p>{[data.client.city, data.client.state].filter(Boolean).join(" / ") || l("unknown")}</p>
        <p className="text-sm text-muted-foreground">
          {l("owner")}: {data.client.owner_name || l("unknown")}
        </p>
        {!demo && (
          <div className="flex flex-wrap gap-2">
            {phone && (
              <Button asChild variant="outline" className="min-h-12">
                <a href={`tel:+${phone}`}>{l("call")}</a>
              </Button>
            )}
            {whatsapp && (
              <Button asChild className="min-h-12">
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        )}
        {data.client.email && <p className="break-all text-base">{data.client.email}</p>}
        <p className="text-sm text-muted-foreground">{l("recordNotice")}</p>
      </section>
      <h3 className="text-lg font-semibold">{l("history")}</h3>
      {data.items.length === 0 && <p className={card}>{l("emptyHistory")}</p>}
      {data.items.map((item) => (
        <article key={`${item.kind}:${item.id}`} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <strong>{l(`kinds.${item.kind}`)}</strong>
            <span className="rounded-full bg-muted px-3 py-1">
              {t(`realEstateDemo.mobile.status.${item.display_status || item.status}`, {
                defaultValue: item.display_status || item.status,
              })}
            </span>
          </div>
          <p className="break-words text-base font-semibold">
            {item.kind === "preference"
              ? t(`realEstateDemo.mobile.types.${item.title}`, { defaultValue: item.title })
              : item.title}
          </p>
          {item.location && <p className="break-words">{item.location}</p>}
          {item.purpose && (
            <p>
              {l(item.purpose === "locacao" ? "rent" : "sale")}
              {item.amount != null &&
                ` · ${item.kind === "preference" ? l("budget") + " " : ""}${money(item.amount)}`}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
              new Date(item.at),
            )}
          </p>
          {item.detail && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2">{l("details")}</summary>
              <p className="break-words">{item.detail}</p>
            </details>
          )}
          {item.kind === "proposal" && item.status === "aceita" && (
            <p className="text-sm text-muted-foreground">{l("acceptedNotice")}</p>
          )}
        </article>
      ))}
    </div>
  );
}
export function MobileWorkspace({
  source,
  onFull,

  demo = false,
  onClientRecord,
}: {
  onClientRecord?: (id: string) => void;
  source: MobileSource;
  onFull: () => void;
  demo?: boolean;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (key: string) => t(`realEstateDemo.mobile.${key}`);
  const locale = LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)];
  const [screen, setScreen] = useState<"home" | "clients" | "agenda" | "properties">("home");
  const [term, setTerm] = useState("");
  const [lookup, setLookup] = useState<{
    term: string;
    page: number;
    data?: MobilePage<MobileClient>;
    busy: boolean;
    error: boolean;
  }>({ term: "", page: 1, busy: false, error: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [agendaPage, setAgendaPage] = useState(1);
  const [propertyFilters, setPropertyFilters] = useState(emptyMobileFilters);
  const [propertyRevision, setPropertyRevision] = useState(0);
  function applyPropertyFilters(filters: ReturnType<typeof emptyMobileFilters>) {
    setPropertyFilters(filters);
    setPropertyRevision((value) => value + 1);
  }
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const request = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const day = mobileDay();
  const today = useQuery({
    queryKey: ["real-estate-mobile-today", source.scope, day.start, agendaPage],
    queryFn: () => source.today(day.start, day.end, agendaPage),
    refetchInterval: 60_000,
  });
  const summary = useQuery({
    queryKey: ["real-estate-mobile-client", source.scope, selected, page],
    enabled: !!selected,
    queryFn: () => source.client(selected!, page),
    staleTime: 0,
  });
  function openClient(id: string) {
    request.current++;
    setSelected(id);
    setPage(1);
  }
  async function search(value: string, currentPage = 1) {
    const name = value.trim();
    setTerm(name);
    setScreen("clients");
    setSelected(null);
    setPage(1);
    const current = ++request.current;
    if (name.length < 2 || name.length > 100) {
      setLookup({ term: name, page: 1, busy: false, error: true });
      return;
    }
    setLookup({ term: name, page: currentPage, busy: true, error: false });
    try {
      const data = await source.search(name, currentPage);
      if (current !== request.current) return;
      setLookup({ term: name, page: currentPage, data, busy: false, error: false });
      const unique = uniqueMobileClient(data, currentPage);
      if (unique) openClient(unique);
    } catch {
      if (current === request.current)
        setLookup({ term: name, page: currentPage, busy: false, error: true });
    }
  }
  function command(text: string) {
    const parsed = mobileCommand(text);
    if (parsed.kind === "client") {
      void search(parsed.name);
      return;
    }
    request.current++;
    setSelected(null);
    if (parsed.kind === "agenda") {
      setScreen("agenda");
      setAgendaPage(1);
      void today.refetch();
    } else {
      applyPropertyFilters(parsed.filters);
      setScreen("properties");
    }
  }
  function home() {
    request.current++;
    setSelected(null);
    setScreen("home");
  }
  const busy = (
    <p role="status" className={card}>
      {l("loading")}
    </p>
  );
  const failure = (retry: () => void) => (
    <div role="alert" className={card}>
      <p>{l("error")}</p>
      <Button variant="outline" onClick={retry}>
        {l("retry")}
      </Button>
    </div>
  );
  function pagination(current: number, total: number, onPage: (page: number) => void) {
    return (
      total > 20 && (
        <div className="flex items-center justify-between gap-2 py-3">
          <Button
            className="min-h-12"
            variant="outline"
            disabled={current === 1}
            onClick={() => onPage(current - 1)}
            aria-label={l("previous")}
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Button>
          <span>
            {current} / {Math.ceil(total / 20)}
          </span>
          <Button
            className="min-h-12"
            variant="outline"
            disabled={current * 20 >= total}
            onClick={() => onPage(current + 1)}
            aria-label={l("next")}
          >
            <ArrowRight aria-hidden className="size-5" />
          </Button>
        </div>
      )
    );
  }
  const agenda = (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{l("today")}</h2>
      {today.isLoading ? (
        busy
      ) : today.isError ? (
        failure(() => void today.refetch())
      ) : (
        <>
          {!today.data?.items.length && <p className={card}>{l("emptyToday")}</p>}
          {today.data?.items.map((item) => (
            <article key={`${item.kind}:${item.id}`} className={card}>
              <p className="text-sm text-muted-foreground">
                {l(`kinds.${item.kind}`)} ·{" "}
                {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
                  new Date(item.at),
                )}
              </p>
              <p className="break-words font-medium">{item.title}</p>
              {item.client_id ? (
                <Button
                  variant="outline"
                  className="min-h-12 w-full"
                  onClick={() => openClient(item.client_id!)}
                >
                  {l("openClient")}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{l("unlinked")}</p>
              )}
            </article>
          ))}
          {pagination(agendaPage, today.data?.total ?? 0, setAgendaPage)}
        </>
      )}
    </section>
  );
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-8 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary">FLUXA</p>
          <h1 className="text-xl font-semibold">{l("title")}</h1>
        </div>
        <Button variant="ghost" className="min-h-12 whitespace-normal" onClick={onFull}>
          {l("full")}
        </Button>
      </header>
      {demo && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">{l("demo")}</p>}
      {selected ? (
        <>
          <Button
            variant="outline"
            className="min-h-12"
            onClick={() => {
              setSelected(null);
            }}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {l("back")}
          </Button>
          {summary.isLoading
            ? busy
            : summary.isError
              ? failure(() => void summary.refetch())
              : summary.data && (
                  <>
                    <MobileClientSummary data={summary.data} demo={demo} />
                    {onClientRecord && (
                      <Button
                        className="min-h-12 w-full"
                        variant="outline"
                        onClick={() => onClientRecord(selected)}
                      >
                        {l("fullClient")}
                      </Button>
                    )}
                    {pagination(page, summary.data.total, setPage)}
                  </>
                )}
        </>
      ) : (
        <>
          {screen !== "home" && (
            <Button variant="ghost" className="min-h-12" onClick={home}>
              <ArrowLeft className="size-4" aria-hidden />
              {l("home")}
            </Button>
          )}
          {(screen === "home" || screen === "clients") && (
            <>
              <DirectClientVoice mode="workspace" onSearch={command} />
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  command(term);
                }}
              >
                <Input
                  ref={searchInput}
                  value={term}
                  maxLength={100}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder={l("commandPlaceholder")}
                  aria-label={l("commandLabel")}
                  className="min-h-12 min-w-0 text-base"
                />
                <Button type="submit" className="min-h-12">
                  {l("search")}
                </Button>
              </form>
            </>
          )}
          {screen === "home" && (
            <nav className="grid grid-cols-3 gap-2" aria-label={l("quick")}>
              <Button
                variant="outline"
                className="h-auto min-h-24 flex-col gap-2 rounded-2xl px-1"
                onClick={() => {
                  setScreen("clients");
                  searchInput.current?.focus();
                }}
              >
                <Users className="size-6" aria-hidden />
                {l("clients")}
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-24 flex-col gap-2 rounded-2xl px-1"
                onClick={() => setScreen("properties")}
              >
                <Building2 className="size-6" aria-hidden />
                {l("properties")}
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-24 flex-col gap-2 rounded-2xl px-1"
                onClick={() => setScreen("agenda")}
              >
                <CalendarDays className="size-6" aria-hidden />
                {l("agenda")}
              </Button>
            </nav>
          )}
          {screen === "clients" && (
            <section className="space-y-3" aria-live="polite">
              {lookup.busy ? (
                busy
              ) : lookup.error ? (
                failure(() => void search(term))
              ) : lookup.data ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {lookup.data.total ? l("choose") : l("emptyClients")}
                  </p>
                  {lookup.data.items.map((client) => (
                    <Button
                      key={client.id}
                      variant="outline"
                      className="h-auto min-h-20 w-full items-start flex-col gap-1 whitespace-normal rounded-2xl p-4 text-left"
                      onClick={() => openClient(client.id)}
                    >
                      <span className="break-words text-base font-semibold">{client.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {[client.city, client.state].filter(Boolean).join(" / ") || l("unknown")}
                      </span>
                    </Button>
                  ))}
                  {pagination(lookup.page, lookup.data.total, (n) => void search(lookup.term, n))}
                </>
              ) : (
                <p>{l("enterName")}</p>
              )}
            </section>
          )}
          {screen === "properties" && (
            <MobilePropertySearch
              key={propertyRevision}
              source={source}
              filters={propertyFilters}
              onFilters={applyPropertyFilters}
              ids={propertyIds}
              onIds={setPropertyIds}
              demo={demo}
            />
          )}
          {(screen === "home" || screen === "agenda") && agenda}
        </>
      )}
    </div>
  );
}
