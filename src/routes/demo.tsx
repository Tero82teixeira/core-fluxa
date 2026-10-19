import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FlaskConical, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConsultingPublicDemo } from "@/components/consulting/consulting-public-demo";
import { buildConsultingDemo, buildConsultingDemoData } from "@/lib/consulting-demo";
import { LegalPublicDemo } from "@/components/legal/legal-public-demo";
import { buildLegalDemo, type LegalDemoState } from "@/lib/legal-demo";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { RealEstatePublicDemo } from "@/components/real-estate/real-estate-public-demo";
import { Button } from "@/components/ui/button";
import { LOCALE_BY_LANGUAGE, type AppLanguage } from "@/i18n";
import { SEGMENT_OPTIONS, type BusinessSegment } from "@/lib/organization-segments";
import { buildDemoData, demoModulesFor, isDemoArea, type DemoData, type DemoModule } from "@/lib/public-demo";

export const Route = createFileRoute("/demo")({
  validateSearch: (search: Record<string, unknown>): { area?: BusinessSegment; catalogo?: string } =>
    isDemoArea(search.area) ? { area: search.area, ...(search.area === "real_estate" && search.catalogo !== undefined ? { catalogo: typeof search.catalogo === "string" && search.catalogo.length <= 200 ? search.catalogo : "invalid" } : {}) } : {},
  head: () => ({
    meta: [
      { title: "Demonstração ao vivo — FLUXA" },
      { name: "description", content: "Explore a FLUXA por área de atuação, sem cadastro e com dados fictícios." },
      { property: "og:title", content: "Demonstração ao vivo — FLUXA" },
      { property: "og:description", content: "Painéis demonstrativos por segmento, sem cadastro e sem dados reais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicDemo,
});

function useFormat() {
  const { i18n } = useTranslation();
  const locale = LOCALE_BY_LANGUAGE[(i18n.resolvedLanguage ?? "pt") as AppLanguage];
  return {
    money: (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(v),
    date: (v: string) => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(`${v.slice(0, 10)}T12:00:00`)),
    time: (v: string) => v.slice(11, 16),
  };
}

function PublicDemo() {
  const { area, catalogo } = Route.useSearch();
  return (
    <div className="demo-surface min-h-dvh min-w-0 bg-background text-foreground">
      <DemoBanner />
      {area === "real_estate" ? <RealEstatePublicDemo key={catalogo ?? "all"} catalogSelection={catalogo} /> : area ? <DemoWorkspace key={area} area={area} /> : <AreaChooser />}
    </div>
  );
}

function DemoBanner() {
  const { t } = useTranslation();
  return (
    <div role="status" className="md:sticky md:top-0 z-40 border-b border-amber-500/30 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <strong className="font-semibold">{t("demo.banner")}</strong>
        <span className="hidden opacity-80 md:inline">{t("demo.bannerDetail")}</span>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher className="h-11 sm:h-8" />
          <Button asChild size="sm" className="min-h-11 sm:min-h-8 sm:h-8">
            <Link to="/entrar" search={{ mode: "signup" }}>
              <span className="hidden sm:inline">{t("demo.createAccount")}</span>
              <span className="sm:hidden">{t("demo.createShort")}</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function AreaChooser() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("demo.back")}
      </Link>
      <p className="mt-8 text-xs font-semibold tracking-[0.16em] text-primary uppercase">{t("demo.chooser.eyebrow")}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("demo.chooser.title")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("demo.chooser.body")}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SEGMENT_OPTIONS.map((segment) => {
          const Icon = segment.icon;
          return (
            <button
              key={segment.key}
              type="button"
              onClick={() => navigate({ to: "/demo", search: { area: segment.key } })}
              className="group flex items-start gap-4 rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between font-semibold">
                  {t(`demo.segments.${segment.key}.label`)}
                  <ArrowRight className="size-4 opacity-0 transition group-hover:opacity-100" aria-hidden />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{t(`demo.segments.${segment.key}.description`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{t("demo.chooser.note")}</p>
    </main>
  );
}

function moduleLabel(t: (k: string | string[]) => string, area: BusinessSegment, module: DemoModule) {
  return t([`demo.modules.${area}.${module}`, `demo.modules.${module}`]);
}

const STATUS_TONE: Record<string, string> = {
  late: "bg-destructive/10 text-destructive",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  expiring: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  review: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  open: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function Status({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[value] ?? "bg-primary/10 text-primary"}`}>
      {t(`demo.status.${value}`)}
    </span>
  );
}

function DemoWorkspace({ area }: { area: BusinessSegment }) {
  const { t } = useTranslation();
  const modules = demoModulesFor(area);
  const [active, setActive] = useState<DemoModule>("overview");
  const [data, setData] = useState<DemoData>(() => area === "consulting_services" ? buildConsultingDemoData() : buildDemoData(area));
  const [consulting, setConsulting] = useState(buildConsultingDemo);
  const [legal, setLegal] = useState<LegalDemoState>(buildLegalDemo);
  const Icon = SEGMENT_OPTIONS.find((s) => s.key === area)?.icon ?? Sparkles;

  return (
    <div className="mx-auto grid max-w-7xl gap-0 md:grid-cols-[14rem_1fr]">
      <aside className="border-b bg-card/60 p-3 md:min-h-[calc(100dvh-2.75rem)] md:border-r md:border-b-0">
        <div className="mb-4 hidden items-center gap-2 px-2 md:flex">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="size-4" aria-hidden /></span>
          <span className="font-display font-semibold">FLUXA</span>
        </div>
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-primary/5 px-2 py-2 text-sm">
          <Icon className="size-4 text-primary" aria-hidden />
          <span className="truncate font-medium">{t(`demo.segments.${area}.label`)}</span>
        </div>
        <nav aria-label={t("demo.nav.operation")} className={["legal", "consulting_services"].includes(area) ? "grid grid-cols-2 gap-1 sm:grid-cols-3 md:flex md:flex-col" : "flex gap-1 overflow-x-auto md:flex-col"}>
          {modules.map((m) => (
            <button
              key={m}
              type="button"
              aria-current={active === m ? "page" : undefined}
              onClick={() => setActive(m)}
              className={`${["legal", "consulting_services"].includes(area) ? "min-h-11 min-w-0 break-words" : "shrink-0"} rounded-lg px-3 py-2 text-left text-sm transition ${active === m ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {moduleLabel(t, area, m)}
            </button>
          ))}
        </nav>
        <Link to="/demo" className="mt-4 hidden px-3 text-xs text-muted-foreground hover:text-foreground md:block">
          ← {t("demo.changeArea")}
        </Link>
      </aside>
      <main className="min-w-0 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{t("demo.overview.greeting")}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{moduleLabel(t, area, active)}</h1>
          </div>
          <Link to="/demo" className="text-sm text-muted-foreground hover:text-foreground md:hidden">← {t("demo.changeArea")}</Link>
        </div>
        {area === "legal" && ["overview", "schedule", "cases"].includes(active) ? (
          <LegalPublicDemo module={active} data={data} setData={setData} legal={legal} setLegal={setLegal} goTo={setActive} />
        ) : area === "consulting_services" && ["overview", "attendance", "proposals", "cases", "schedule"].includes(active) ? <ConsultingPublicDemo module={active} data={data} setData={setData} consulting={consulting} setConsulting={setConsulting} goTo={setActive} /> : <ModuleView area={area} module={active} data={data} setData={setData} goTo={setActive} />}
      </main>
    </div>
  );
}

function ModuleView({ area, module, data, setData, goTo }: { area: BusinessSegment; module: DemoModule; data: DemoData; setData: (fn: (d: DemoData) => DemoData) => void; goTo: (m: DemoModule) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const recordName = (id: string) => data.records.find((r) => r.id === id)?.name ?? "—";
  const q = query.toLowerCase();
  const notify = () => toast.success(t("demo.table.tempChange"));

  const income = data.finance.filter((x) => x.type === "income").reduce((s, x) => s + x.amount, 0);
  const expense = data.finance.filter((x) => x.type === "expense").reduce((s, x) => s + x.amount, 0);

  if (module === "overview") {
    const late = data.cases.filter((c) => c.status === "late");
    const kpis = [
      [t("demo.overview.kpiOpenCases"), data.cases.filter((c) => c.status !== "done").length, "cases"],
      [t("demo.overview.kpiLate"), late.length, "cases"],
      [t("demo.overview.kpiTasks"), data.tasks.filter((x) => !x.done).length, "tasks"],
      [t("demo.overview.kpiReceivable"), f.money(data.finance.filter((x) => x.type === "income" && x.status !== "paid").reduce((s, x) => s + x.amount, 0)), "finance"],
    ] as const;
    const attention = [...late.map((c) => ({ id: c.id, label: t(c.titleKey), detail: `${c.code} · ${f.date(c.due)}` })), ...data.tasks.filter((x) => !x.done && x.priority === "high").map((x) => ({ id: x.id, label: t(x.titleKey), detail: `${x.owner} · ${f.date(x.due)}` }))];
    const modules = demoModulesFor(area);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(([label, value, target]) => (
            <button key={label} type="button" onClick={() => modules.includes(target) && goTo(target)} className="rounded-2xl border bg-card p-4 text-left hover:border-primary/40">
              <p className="text-xs text-muted-foreground uppercase">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            </button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">{t("demo.overview.attention")}</h2>
            <ul className="mt-3 space-y-2">
              {attention.length === 0 && <li className="text-sm text-muted-foreground">{t("demo.overview.attentionEmpty")}</li>}
              {attention.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                  <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden />
                  <span className="min-w-0"><span className="block truncate font-medium">{a.label}</span><span className="text-xs text-muted-foreground">{a.detail}</span></span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">{data.schedule.length ? t("demo.overview.upcoming") : t("demo.overview.cashflow")}</h2>
            {data.schedule.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {data.schedule.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3"><span className="truncate">{t(s.typeKey)} · {recordName(s.recordId)}</span><span className="shrink-0 text-muted-foreground tabular-nums">{f.date(s.date)} {f.time(s.date)}</span></li>
                ))}
              </ul>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt>{t("demo.overview.income")}</dt><dd className="tabular-nums">{f.money(income)}</dd></div>
                <div className="flex justify-between"><dt>{t("demo.overview.expense")}</dt><dd className="tabular-nums">{f.money(expense)}</dd></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><dt>{t("demo.overview.balance")}</dt><dd className="tabular-nums">{f.money(income - expense)}</dd></div>
              </dl>
            )}
          </section>
        </div>
      </div>
    );
  }

  const toolbar = (statuses: string[]) => (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("demo.table.search")} aria-label={t("demo.table.search")} className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm" />
      <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("demo.table.status")} className="h-9 rounded-lg border bg-background px-2 text-sm">
        <option value="all">{t("demo.table.all")}</option>
        {statuses.map((s) => <option key={s} value={s}>{t(`demo.status.${s}`)}</option>)}
      </select>
    </div>
  );
  const pass = (text: string, status: string) => text.toLowerCase().includes(q) && (filter === "all" || filter === status);
  const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[] }) => (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-left text-xs text-muted-foreground uppercase"><tr>{head.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{rows.length ? rows : <tr><td colSpan={head.length} className="px-4 py-6 text-center text-muted-foreground">{t("demo.table.empty")}</td></tr>}</tbody>
      </table>
    </div>
  );

  if (module === "records")
    return (<>{toolbar(["active", "pending", "review"])}<Table head={[t("demo.table.name"), t("demo.table.type"), t("demo.table.owner"), t("demo.table.status")]} rows={data.records.filter((r) => pass(r.name, r.status)).map((r) => (
      <tr key={r.id}><td className="px-4 py-3 font-medium">{r.name}<span className="block text-xs text-muted-foreground">{r.city}</span></td><td className="px-4 py-3">{t(`demo.kind.${r.kind}`)}</td><td className="px-4 py-3">{r.owner}</td><td className="px-4 py-3"><Status value={r.status} /></td></tr>))} /></>);

  if (module === "cases")
    return (<>{toolbar(["late", "active", "review", "pending", "done"])}<Table head={[t("demo.table.code"), t("demo.table.title"), t("demo.table.linked"), t("demo.table.due"), t("demo.table.amount"), t("demo.table.status"), ""]} rows={data.cases.filter((c) => pass(`${c.code} ${t(c.titleKey)}`, c.status)).map((c) => (
      <tr key={c.id}><td className="px-4 py-3 font-mono text-xs">{c.code}</td><td className="px-4 py-3 font-medium">{t(c.titleKey)}</td><td className="px-4 py-3">{recordName(c.recordId)}</td><td className="px-4 py-3 text-center tabular-nums">{f.date(c.due)}</td><td className="px-4 py-3 text-right tabular-nums">{f.money(c.amount)}</td><td className="px-4 py-3"><Status value={c.status} /></td>
        <td className="px-4 py-3 text-right">{c.status !== "done" && <Button size="sm" variant="outline" onClick={() => { setData((d) => ({ ...d, cases: d.cases.map((x) => x.id === c.id ? { ...x, status: "done" } : x) })); notify(); }}>{t("demo.table.advance")}</Button>}</td></tr>))} /></>);

  if (module === "tasks")
    return (<Table head={[t("demo.table.title"), t("demo.table.owner"), t("demo.table.due"), t("demo.table.status"), ""]} rows={data.tasks.map((x) => (
      <tr key={x.id}><td className="px-4 py-3 font-medium">{t(x.titleKey)}<span className="block text-xs text-muted-foreground">{t(`demo.priority.${x.priority}`)}</span></td><td className="px-4 py-3">{x.owner}</td><td className="px-4 py-3 text-center tabular-nums">{f.date(x.due)}</td><td className="px-4 py-3"><Status value={x.done ? "done" : "open"} /></td>
        <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => { setData((d) => ({ ...d, tasks: d.tasks.map((y) => y.id === x.id ? { ...y, done: !y.done } : y) })); notify(); }}>{x.done ? t("demo.table.reopen") : t("demo.table.markDone")}</Button></td></tr>))} />);

  if (module === "schedule")
    return (<Table head={[t("demo.table.date"), t("demo.table.type"), t("demo.table.linked"), t("demo.table.status")]} rows={data.schedule.map((s) => (
      <tr key={s.id}><td className="px-4 py-3 tabular-nums">{f.date(s.date)} · {f.time(s.date)}</td><td className="px-4 py-3 font-medium">{t(s.typeKey)}</td><td className="px-4 py-3">{recordName(s.recordId)}</td><td className="px-4 py-3"><Status value="scheduled" /></td></tr>))} />);

  if (module === "documents")
    return (<Table head={[t("demo.table.name"), t("demo.table.linked"), t("demo.table.due"), t("demo.table.status")]} rows={data.documents.map((d) => (
      <tr key={d.id}><td className="px-4 py-3 font-medium">{t(d.nameKey)}</td><td className="px-4 py-3">{recordName(d.recordId)}</td><td className="px-4 py-3 text-center tabular-nums">{f.date(d.expires)}</td><td className="px-4 py-3"><Status value={d.status} /></td></tr>))} />);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[[t("demo.overview.income"), income], [t("demo.overview.expense"), expense], [t("demo.overview.balance"), income - expense]].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground uppercase">{l}</p><p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{f.money(Number(v))}</p></div>
        ))}
      </div>
      <Table head={[t("demo.table.title"), t("demo.table.type"), t("demo.table.due"), t("demo.table.amount"), t("demo.table.status")]} rows={data.finance.map((x) => (
        <tr key={x.id}><td className="px-4 py-3 font-medium">{t(x.descKey)}</td><td className="px-4 py-3">{t(`demo.financeType.${x.type}`)}</td><td className="px-4 py-3 text-center tabular-nums">{f.date(x.due)}</td><td className="px-4 py-3 text-right tabular-nums">{f.money(x.amount)}</td><td className="px-4 py-3"><Status value={x.status} /></td></tr>))} />
    </div>
  );
}
