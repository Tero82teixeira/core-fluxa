import "@/i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Scale, CalendarClock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LOCALE_BY_LANGUAGE, type AppLanguage } from "@/i18n";
import { legalAgendaRange, validLegalDate } from "@/lib/legal-agenda";
import {
  LEGAL_DEMO_DATE,
  legalDemoAgenda,
  summarizeLegalDemo,
  toggleLegalDemoDeadline,
  updateLegalDemoHearing,
  type LegalDemoState,
  type LegalDemoEvent,
} from "@/lib/legal-demo";
import type { DemoData, DemoModule } from "@/lib/public-demo";

function useLegalDemoFormat() {
  const { i18n } = useTranslation();
  const locale = LOCALE_BY_LANGUAGE[(i18n.resolvedLanguage ?? "pt") as AppLanguage];
  return (date: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(`${date}T12:00:00`),
    );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function EventCard({
  event,
  data,
  onCase,
}: {
  event: LegalDemoEvent;
  data: DemoData;
  onCase: (id: string) => void;
}) {
  const { t } = useTranslation();
  const date = useLegalDemoFormat();
  const process = data.cases.find((c) => c.id === event.caseId);
  const client = data.records.find((r) => r.id === process?.recordId);
  return (
    <article className="min-w-0 space-y-2 rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-primary">{t(`legalDemo.kinds.${event.kind}`)}</p>
      <h3 className="break-words font-semibold">{t(event.titleKey)}</h3>
      <p className="break-words text-sm text-muted-foreground">
        {process?.code}
        {client ? ` · ${client.name}` : event.owner}
      </p>
      <p className="text-sm">
        {date(event.date)} · {event.time ?? t("legalDemo.allDay")}
      </p>
      {process && (
        <Button variant="outline" className="min-h-11" onClick={() => onCase(process.id)}>
          {t("legalDemo.openCase")}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}
    </article>
  );
}
export function LegalDemoPanel({
  data,
  legal,
  onCase,
  onAgenda,
}: {
  data: DemoData;
  legal: LegalDemoState;
  onCase: (id: string) => void;
  onAgenda: () => void;
}) {
  const { t } = useTranslation();
  const summary = summarizeLegalDemo(data, legal);
  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("legalDemo.active")} value={summary.active} />
        <Metric label={t("legalDemo.overdue")} value={summary.overdue} />
        <Metric label={t("legalDemo.today")} value={summary.today} />
        <Metric label={t("legalDemo.nextSeven")} value={summary.nextSeven} />
        <Metric label={t("legalDemo.requirement")} value={summary.requirement} />
        <Metric label={t("legalDemo.withoutOwner")} value={summary.withoutOwner} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Scale className="size-5" aria-hidden />
          {t("legalDemo.priority")}
        </h2>
        <Button variant="outline" className="min-h-11" onClick={onAgenda}>
          <CalendarClock className="size-4" aria-hidden />
          {t("legalDemo.openAgenda")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("legalDemo.countHint")}</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {summary.urgent.slice(0, 8).map((event) => (
          <EventCard key={event.id} event={event} data={data} onCase={onCase} />
        ))}
      </div>
      {!summary.urgent.length && <p>{t("legalDemo.empty")}</p>}
      {summary.urgent.length > 8 && (
        <p className="text-sm text-muted-foreground">
          {t("legalDemo.preview", { shown: 8, total: summary.urgent.length })}
        </p>
      )}
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">{t("legalDemo.tasks")}</h2>
        <ul className="mt-3 space-y-2">
          {data.tasks
            .filter((task) => !task.done)
            .slice(0, 6)
            .map((task) => (
              <li key={task.id} className="break-words text-sm">
                {t(task.titleKey)} · {task.owner}
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}
export function LegalDemoAgenda({
  data,
  legal,
  date,
  view,
  page,
  onDate,
  onView,
  onPage,
  onCase,
}: {
  data: DemoData;
  legal: LegalDemoState;
  date: string;
  view: "day" | "week";
  page: number;
  onDate: (date: string) => void;
  onView: (view: "day" | "week") => void;
  onPage: (page: number) => void;
  onCase: (id: string) => void;
}) {
  const { t } = useTranslation();
  const format = useLegalDemoFormat();
  const range = legalAgendaRange(date, view);
  const agenda = legalDemoAgenda(data, legal, range.startDate, range.endDate, page);
  const move = (direction: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + direction * (view === "week" ? 7 : 1));
    onDate(d.toISOString().slice(0, 10));
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <label className="min-w-0 text-sm">
          {t("legalDemo.date")}
          <Input
            type="date"
            aria-label={t("legalDemo.date")}
            min="2000-01-01"
            max="2100-12-31"
            className="mt-1 min-h-11 text-base"
            value={date}
            onChange={(e) => onDate(e.target.value)}
          />
        </label>
        <Button variant="outline" className="min-h-11" onClick={() => move(-1)}>
          {t("legalDemo.previous")}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => move(1)}>
          {t("legalDemo.next")}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => onDate(LEGAL_DEMO_DATE)}>
          {t("legalDemo.reference")}
        </Button>
        <div className="flex gap-1">
          <Button
            className="min-h-11"
            variant={view === "day" ? "secondary" : "ghost"}
            aria-pressed={view === "day"}
            onClick={() => onView("day")}
          >
            {t("legalDemo.day")}
          </Button>
          <Button
            className="min-h-11"
            variant={view === "week" ? "secondary" : "ghost"}
            aria-pressed={view === "week"}
            onClick={() => onView("week")}
          >
            {t("legalDemo.week")}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("legalDemo.period", { date: format(range.startDate) })} · {t("legalDemo.timeHint")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Metric label={t("legalDemo.hearings")} value={agenda.hearings} />
        <Metric label={t("legalDemo.deadlines")} value={agenda.deadlines} />
        <Metric label={t("legalDemo.tasks")} value={agenda.tasks} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {agenda.items.map((event) => (
          <EventCard key={event.id} event={event} data={data} onCase={onCase} />
        ))}
      </div>
      {!agenda.items.length && (
        <p className="rounded-xl border border-dashed p-5">{t("legalDemo.empty")}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <p className="text-sm">{t("legalDemo.total", { total: agenda.total })}</p>
        {agenda.pages > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={agenda.page === 1}
              onClick={() => onPage(agenda.page - 1)}
            >
              {t("legalDemo.previousPage")}
            </Button>
            <span>
              {agenda.page} / {agenda.pages}
            </span>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={agenda.page === agenda.pages}
              onClick={() => onPage(agenda.page + 1)}
            >
              {t("legalDemo.nextPage")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
export function LegalPublicDemo({
  module,
  data,
  setData,
  legal,
  setLegal,
  goTo,
}: {
  module: DemoModule;
  data: DemoData;
  setData: (fn: (data: DemoData) => DemoData) => void;
  legal: LegalDemoState;
  setLegal: (fn: (state: LegalDemoState) => LegalDemoState) => void;
  goTo: (module: DemoModule) => void;
}) {
  const { t } = useTranslation();
  const format = useLegalDemoFormat();
  const [date, setDate] = useState(LEGAL_DEMO_DATE);
  const [view, setView] = useState<"day" | "week">("week");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [hearingAt, setHearingAt] = useState("");
  const process = data.cases.find((c) => c.id === selected);
  const hearing = legal.hearings.find((h) => h.caseId === selected);
  const notify = () => toast.success(t("demo.table.tempChange"));
  const openCase = (id: string) => {
    setSelected(id);
    setHearingAt(legal.hearings.find((h) => h.caseId === id)?.at ?? "");
  };
  const cnj = (id: string) => `000004${id.slice(1)}-00.2026.8.08.0000`;
  const normalized = query.trim().toLocaleLowerCase();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium">
          {t("legalDemo.referenceHint", { date: format(LEGAL_DEMO_DATE) })}
        </p>
        <p className="mt-1 text-muted-foreground">{t("legalDemo.simulationHint")}</p>
      </div>
      {module === "overview" && (
        <LegalDemoPanel
          data={data}
          legal={legal}
          onCase={openCase}
          onAgenda={() => goTo("schedule")}
        />
      )}
      {module === "schedule" && (
        <LegalDemoAgenda
          data={data}
          legal={legal}
          date={date}
          view={view}
          page={page}
          onDate={(d) => {
            if (validLegalDate(d)) {
              setDate(d);
              setPage(1);
            }
          }}
          onView={(v) => {
            setView(v);
            setPage(1);
          }}
          onPage={setPage}
          onCase={openCase}
        />
      )}
      {module === "cases" && (
        <section className="space-y-4">
          <Input
            aria-label={t("legalDemo.search")}
            placeholder={t("legalDemo.search")}
            className="min-h-11 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="grid gap-3 xl:grid-cols-2">
            {data.cases
              .filter((c) =>
                `${c.code} ${cnj(c.id)} ${t(c.titleKey)} ${data.records.find((r) => r.id === c.recordId)?.name}`
                  .toLocaleLowerCase()
                  .includes(normalized),
              )
              .map((c) => (
                <article key={c.id} className="min-w-0 space-y-2 rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">
                    {c.code} · {t(`demo.status.${c.status}`)}
                  </p>
                  <h2 className="break-words font-semibold">{t(c.titleKey)}</h2>
                  <p className="break-words text-sm">
                    {data.records.find((r) => r.id === c.recordId)?.name}
                  </p>
                  <p className="break-all text-sm text-muted-foreground">
                    {t("legalDemo.cnj")}: {cnj(c.id)}
                  </p>
                  <Button variant="outline" className="min-h-11" onClick={() => openCase(c.id)}>
                    {t("legalDemo.openCase")}
                  </Button>
                </article>
              ))}
          </div>
          {!data.cases.some((c) =>
            `${c.code} ${cnj(c.id)} ${t(c.titleKey)} ${data.records.find((r) => r.id === c.recordId)?.name}`
              .toLocaleLowerCase()
              .includes(normalized),
          ) && <p>{t("legalDemo.empty")}</p>}
        </section>
      )}
      <Dialog
        open={!!process}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>
            {process ? `${process.code} · ${t(process.titleKey)}` : t("legalDemo.openCase")}
          </DialogTitle>
          <DialogDescription>{t("legalDemo.caseHint")}</DialogDescription>
          {process && (
            <div className="space-y-5">
              <div className="rounded-xl border p-3 text-sm">
                <p>{data.records.find((r) => r.id === process.recordId)?.name}</p>
                <p className="break-all">
                  {t("legalDemo.cnj")}: {cnj(process.id)}
                </p>
                <p>{t("legalDemo.court")}</p>
              </div>
              {hearing && (
                <form
                  className="space-y-2 rounded-xl border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const next = updateLegalDemoHearing(legal, hearing.id, hearingAt);
                    if (next === legal) {
                      toast.error(t("legalDemo.invalidDate"));
                      return;
                    }
                    setLegal(() => next);
                    notify();
                  }}
                >
                  <label className="block text-sm" htmlFor="demo-legal-hearing">
                    {t("legalDemo.nextHearing")}
                  </label>
                  <Input
                    id="demo-legal-hearing"
                    type="datetime-local"
                    required
                    min="2000-01-01T00:00"
                    max="2100-12-31T23:59"
                    value={hearingAt}
                    onChange={(e) => setHearingAt(e.target.value)}
                    className="min-h-11 min-w-0 text-base"
                  />
                  <Button type="submit" className="min-h-11">
                    {t("legalDemo.saveHearing")}
                  </Button>
                </form>
              )}
              <section className="space-y-2">
                <h2 className="font-semibold">{t("legalDemo.deadlines")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("legalDemo.generalDue")}: {format(process.due)}
                </p>
                {legal.deadlines
                  .filter((d) => d.caseId === process.id)
                  .map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{t(d.titleKey)}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(d.date)} · {t(`legalDemo.status.${d.status}`)}
                        </p>
                      </div>
                      {d.status !== "cancelled" && process.status !== "done" && (
                        <Button
                          variant="outline"
                          className="min-h-11"
                          onClick={() => {
                            setLegal((state) => toggleLegalDemoDeadline(state, d.id));
                            notify();
                          }}
                        >
                          {t(d.status === "open" ? "demo.table.markDone" : "demo.table.reopen")}
                        </Button>
                      )}
                    </div>
                  ))}
              </section>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setData((state) => ({
                    ...state,
                    cases: state.cases.map((c) =>
                      c.id === process.id
                        ? { ...c, status: c.status === "done" ? "active" : "done" }
                        : c,
                    ),
                  }));
                  notify();
                }}
              >
                {t(process.status === "done" ? "legalDemo.reopenCase" : "legalDemo.finishCase")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
