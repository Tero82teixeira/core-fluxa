import { RealEstateDemoCatalog } from "./real-estate-demo-catalog";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building2, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
import { downloadBlob } from "@/lib/data-protection";
import { settlementCsv } from "@/lib/real-estate-finance";
import {
  REAL_ESTATE_DEMO_DATE,
  buildRealEstateDemo,
  applyRealEstateDemoAction,
  realEstateDemoSummary,
  realEstateDemoMatches,
  type RealEstateDemoAction,
} from "@/lib/real-estate-public-demo";

const modules = [
  "overview",
  "catalog",
  "attendance",
  "commercial",
  "properties",
  "proposals",
  "contracts",
  "settlements",
] as const;
type Module = (typeof modules)[number];
const card = "space-y-3 rounded-2xl border bg-card p-4 sm:p-5";

export function RealEstatePublicDemo({ catalogSelection }: { catalogSelection?: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(buildRealEstateDemo);
  const [active, setActive] = useState<Module>(
    catalogSelection !== undefined ? "catalog" : "overview",
  );
  const [catalogReset, setCatalogReset] = useState(0);
  const [query, setQuery] = useState("");
  const locale = LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)];
  const money = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(amount);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" }).format(
      new Date(`${value}T12:00:00Z`),
    );
  const label = (key: string) => t(`realEstateDemo.${key}`);
  const summary = realEstateDemoSummary(data);
  const property = (id: string) => data.properties.find((p) => p.id === id)!;
  const matches = (id: string) =>
    realEstateDemoMatches(data, id, query, label(`titles.${property(id).titleKey}`));
  const go = (module: Module, search = "") => {
    setActive(module);
    setQuery(search);
  };
  function act(action: RealEstateDemoAction) {
    setData((d) => applyRealEstateDemoAction(d, action));
    toast.success(t("demo.table.tempChange"));
    if (action.type === "contract") go("contracts");
    if (action.type === "settlement") go("settlements");
  }
  const status = (key: string) => (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${key === "atrasado" || key === "expired" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
    >
      {label(`status.${key}`)}
    </span>
  );
  const financial = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(["gross_received", "commission_received", "owner_pending", "owner_paid"] as const).map(
        (key) => (
          <div key={key} className={card}>
            <p className="text-sm text-muted-foreground">{label(`money.${key}`)}</p>
            <strong className="block text-xl tabular-nums">{money(summary[key])}</strong>
          </div>
        ),
      )}
    </div>
  );
  const noRows = (
    <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
      {label("empty")}
    </p>
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="rounded-3xl bg-slate-950 p-5 text-white sm:p-8">
        <Link to="/demo" className="text-sm text-slate-300 hover:text-white">
          ← {t("demo.changeArea")}
        </Link>
        <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
          <Building2 className="size-7 shrink-0 text-amber-300" aria-hidden />
          {label("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{label("intro")}</p>
        <p className="mt-2 text-xs text-amber-200">
          {t("realEstateDemo.scenario", { date: date(REAL_ESTATE_DEMO_DATE) })}
        </p>
        <div className="demo-hero-actions mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button asChild className="bg-amber-300 text-slate-950 hover:bg-amber-200">
            <Link to="/entrar" search={{ mode: "signup" }}>
              {label("trial")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button
            variant="outline"
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              setData(buildRealEstateDemo());
              setCatalogReset((n) => n + 1);
              go("overview");
              toast.success(label("resetDone"));
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            {label("reset")}
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-300">{label("trialNote")}</p>
      </header>
      <div className="sticky top-0 z-30 my-5 rounded-xl border bg-background p-3 shadow-sm md:hidden">
        <label htmlFor="real-estate-demo-section" className="mb-2 block text-sm font-medium">
          {t("demo.nav.operation")}
        </label>
        <select
          id="real-estate-demo-section"
          value={active}
          onChange={(event) => go(event.target.value as Module)}
          className="min-h-12 w-full min-w-0 rounded-lg border bg-background px-3 text-base font-medium"
        >
          {modules.map((module) => (
            <option key={module} value={module}>
              {label(`modules.${module}`)}
            </option>
          ))}
        </select>
      </div>
      <nav
        aria-label={t("demo.nav.operation")}
        className="my-5 hidden gap-2 overflow-x-auto pb-2 md:flex"
      >
        {modules.map((module) => (
          <Button
            key={module}
            variant={active === module ? "default" : "outline"}
            className="shrink-0"
            aria-current={active === module ? "page" : undefined}
            onClick={() => go(module)}
          >
            {label(`modules.${module}`)}
          </Button>
        ))}
      </nav>
      <main className="space-y-4">
        <h2 className="text-xl font-semibold">{label(`modules.${active}`)}</h2>
        {active !== "overview" && active !== "catalog" && active !== "commercial" && (
          <input
            value={query}
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            aria-label={label("search")}
            placeholder={label("search")}
          />
        )}
        <div hidden={active !== "catalog" && active !== "attendance" && active !== "commercial"}>
          <RealEstateDemoCatalog
            key={`${catalogSelection}-${catalogReset}`}
            selection={catalogSelection}
            proposals={data.proposals}
            mode={
              active === "commercial"
                ? "commercial"
                : active === "attendance"
                  ? "attendance"
                  : "catalog"
            }
            onOpenAttendance={() => go("attendance")}
          />
        </div>
        {active === "overview" && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["proposals", summary.proposals, "proposals"],
                  ["contracts", summary.contracts, "contracts"],
                  ["late", summary.late, "settlements"],
                ] as const
              ).map(([key, count, module]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => go(module)}
                  className={`${card} text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                >
                  <span className="block text-sm text-muted-foreground">
                    {label(`pending.${key}`)}
                  </span>
                  <strong className="block text-2xl">{count}</strong>
                </button>
              ))}
            </div>
            {financial}
            <p className="text-xs text-muted-foreground">{label("financialNote")}</p>
            <section className={card}>
              <h3 className="font-semibold">{label("catalog.module")}</h3>
              <p className="text-sm text-muted-foreground">{label("catalog.intro")}</p>
              <Button variant="outline" onClick={() => go("catalog")}>
                {label("catalog.preview")}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </section>
            <section className={card}>
              <h3 className="font-semibold">{label("journeyTitle")}</h3>
              <ol className="grid gap-3 sm:grid-cols-3">
                {(["proposals", "contracts", "settlements"] as const).map((module, index) => (
                  <li key={module} className="rounded-xl bg-muted/50 p-4">
                    <strong>
                      {index + 1}. {label(`modules.${module}`)}
                    </strong>
                    <p className="my-3 text-sm text-muted-foreground">
                      {label(`journey.${module}`)}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => go(module)}>
                      {label("explore")}
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
        {active === "properties" && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.properties
              .filter((p) => matches(p.id))
              .map((p) => (
                <article key={p.id} className={card}>
                  <p className="font-mono text-xs text-muted-foreground">{p.id}</p>
                  <h3 className="font-semibold">{label(`titles.${p.titleKey}`)}</h3>
                  <p className="text-sm">
                    {label("owner")}: {p.owner}
                  </p>
                  <p>
                    {label(`purpose.${p.purpose}`)} · {money(p.amount)}
                  </p>
                  <Button variant="outline" onClick={() => go("proposals", p.id)}>
                    {label("viewProposals")}
                  </Button>
                </article>
              ))}
            {!data.properties.some((p) => matches(p.id)) && noRows}
          </div>
        )}
        {active === "proposals" && (
          <div className="grid gap-4 md:grid-cols-2">
            {data.proposals
              .filter((p) => matches(p.property))
              .map((p) => {
                const pending = ["aberta", "contraproposta"].includes(p.status);
                const expired = pending && p.validUntil < REAL_ESTATE_DEMO_DATE;
                const contract = data.contracts.find((c) => c.proposal === p.id);
                return (
                  <article key={p.id} className={card}>
                    <p className="font-mono text-xs text-muted-foreground">
                      {p.id} · {p.property}
                    </p>
                    <h3 className="font-semibold">{p.interested}</h3>
                    {status(expired ? "expired" : p.status)}
                    <p className="text-sm">
                      {label("amount")}: {money(p.amount)} · {label("validity")}:{" "}
                      {date(p.validUntil)}
                    </p>
                    {expired && (
                      <p className="text-xs text-muted-foreground">{label("expiredNote")}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {pending && (
                        <>
                          {!expired && (
                            <Button onClick={() => act({ type: "accept", id: p.id })}>
                              {label("actions.accept")}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => act({ type: "refuse", id: p.id })}
                          >
                            {label("actions.refuse")}
                          </Button>
                        </>
                      )}
                      {p.status === "aceita" &&
                        (contract ? (
                          <Button variant="outline" onClick={() => go("contracts", p.property)}>
                            {label("viewContracts")}
                          </Button>
                        ) : (
                          <Button onClick={() => act({ type: "contract", id: p.id })}>
                            {label("actions.contract")}
                          </Button>
                        ))}
                    </div>
                  </article>
                );
              })}
            {!data.proposals.some((p) => matches(p.property)) && noRows}
          </div>
        )}
        {active === "contracts" && (
          <div className="grid gap-4 md:grid-cols-2">
            {data.contracts
              .filter((c) => matches(c.property))
              .map((c) => (
                <article key={c.id} className={card}>
                  <h3 className="font-semibold">
                    {c.id} · {c.property}
                  </h3>
                  <p className="text-sm">
                    {label("owner")}: {property(c.property).owner}
                  </p>
                  <p>{money(c.amount)}</p>
                  <p className="text-sm">
                    {date(c.startsOn)} → {c.endsOn ? date(c.endsOn) : label("noEnd")}
                  </p>
                  {c.endsOn && c.endsOn <= "2026-11-15" && status("expiring")}
                  <div>
                    {data.settlements.some(
                      (s) => s.contract_id === c.id && s.reference === "2026-10",
                    ) ? (
                      <Button variant="outline" onClick={() => go("settlements", c.property)}>
                        {label("viewSettlements")}
                      </Button>
                    ) : (
                      <Button onClick={() => act({ type: "settlement", id: c.id })}>
                        {label("actions.settlement")}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            {!data.contracts.some((c) => matches(c.property)) && noRows}
          </div>
        )}
        {active === "settlements" && (
          <>
            {financial}
            <p className="text-xs text-muted-foreground">{label("financialNote")}</p>
            <Button
              variant="outline"
              onClick={() => {
                const rows = data.settlements.filter((s) => matches(s.property_id));
                if (!rows.length) {
                  toast.info(label("empty"));
                  return;
                }
                downloadBlob(
                  new Blob([settlementCsv(rows.map((s) => ({ ...s, note: t("demo.banner") })))], {
                    type: "text/csv;charset=utf-8",
                  }),
                  "fluxa-demo-imobiliaria.csv",
                );
              }}
            >
              {label("download")}
            </Button>
            <div className="grid gap-4 md:grid-cols-2">
              {data.settlements
                .filter((s) => matches(s.property_id))
                .map((s) => (
                  <article key={s.id} className={card}>
                    <h3 className="font-semibold">
                      {s.property_code} · {s.reference}
                    </h3>
                    <p className="text-sm">
                      {s.contract_reference} · {s.owner_name}
                    </p>
                    {status(s.display_status)}
                    <dl className="space-y-2 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{label("gross")}</dt>
                        <dd>{money(s.gross)}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{label("commission")} (10%)</dt>
                        <dd>{money(s.commission_amount)}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{label("ownerAmount")}</dt>
                        <dd>{money(s.owner_amount)}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{label("due")}</dt>
                        <dd>{date(s.due_on)}</dd>
                      </div>
                    </dl>
                    {s.status === "previsto" && (
                      <Button onClick={() => act({ type: "receive", id: s.id })}>
                        {label("actions.receive")}
                      </Button>
                    )}
                    {s.status === "recebido" && (
                      <Button onClick={() => act({ type: "pay", id: s.id })}>
                        {label("actions.pay")}
                      </Button>
                    )}
                  </article>
                ))}
              {!data.settlements.some((s) => matches(s.property_id)) && noRows}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">{label("localNote")}</p>
      </main>
    </div>
  );
}
