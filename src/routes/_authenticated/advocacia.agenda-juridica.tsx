import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileWarning,
  Gavel,
  ListTodo,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLegalAgendaPage, type LegalAgendaEvent } from "@/hooks/use-legal-cases";
import { legalAgendaRange, validLegalDate } from "@/lib/legal-agenda";
import { localCivilDate } from "@/lib/legal-workspace";
import { useWorkspace } from "@/lib/workspace";

type ViewMode = "day" | "week";

export const Route = createFileRoute("/_authenticated/advocacia/agenda-juridica")({
  validateSearch: (search: Record<string, unknown>) => ({
    date: validLegalDate(search.date) ? search.date : undefined,
    view: search.view === "week" ? ("week" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agenda Jurídica — FLUXA Advocacia" },
      {
        name: "description",
        content: "Audiências, prazos processuais e tarefas jurídicas em uma única agenda.",
      },
    ],
  }),
  component: LegalAgendaPage,
});

function civilDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localCivilDate(date);
}

function eventDate(value: string) {
  const date = new Date(value);
  return localCivilDate(date);
}

function LegalAgendaPage() {
  const { organizationId } = useWorkspace();
  const search = Route.useSearch();
  const [date, setDate] = useState(search.date ?? localCivilDate());
  const [view, setView] = useState<ViewMode>(search.view ?? "week");
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (validLegalDate(search.date)) {
      setDate(search.date);
      setPage(1);
    }
  }, [search.date]);
  const range = useMemo(() => legalAgendaRange(date, view), [date, view]);
  const agenda = useLegalAgendaPage(organizationId, range, page);
  useEffect(() => {
    if (agenda.data) {
      const last = Math.max(1, Math.ceil(agenda.data.total / 20));
      if (page > last) setPage(last);
    }
  }, [agenda.data, page]);
  const days = useMemo(
    () =>
      Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => {
        const day = addDays(range.startDate, index);
        return {
          day,
          events: (agenda.data?.items ?? []).filter(
            (event) => (event.civil_date ?? eventDate(event.at)) === day,
          ),
        };
      }),
    [agenda.data, range.startDate, view],
  );
  const changeDate = (next: string) => {
    if (validLegalDate(next)) {
      setDate(next);
      setPage(1);
    }
  };
  const move = (direction: number) =>
    changeDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  const counts = agenda.data?.counts;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-amber-200 uppercase">
              FLUXA Advocacia
            </p>
            <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
              <CalendarClock className="size-7" aria-hidden /> Agenda Jurídica
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
              Audiências, prazos processuais e tarefas da equipe reunidos por dia.
            </p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link to="/advocacia/painel-juridico">Abrir Painel Jurídico</Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Audiências" value={counts?.hearing} icon={Gavel} tone="amber" />
        <Metric
          label="Prazos processuais"
          value={counts?.deadline}
          icon={FileWarning}
          tone="rose"
        />
        <Metric label="Tarefas" value={counts?.task} icon={ListTodo} tone="blue" />
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Período anterior"
              onClick={() => move(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <input
              aria-label="Data da agenda"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              className="h-11 min-w-0 rounded-xl border bg-background px-3 text-base"
              value={date}
              onChange={(event) => changeDate(event.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Próximo período"
              onClick={() => move(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => changeDate(localCivilDate())}>
              Hoje
            </Button>
          </div>
          <div className="flex rounded-xl border p-1">
            <Button
              size="sm"
              variant={view === "day" ? "secondary" : "ghost"}
              onClick={() => {
                setView("day");
                setPage(1);
              }}
            >
              Dia
            </Button>
            <Button
              size="sm"
              variant={view === "week" ? "secondary" : "ghost"}
              onClick={() => {
                setView("week");
                setPage(1);
              }}
            >
              Semana
            </Button>
          </div>
        </CardContent>
      </Card>

      {agenda.isLoading ? (
        <Card>
          <CardContent className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando agenda jurídica…
          </CardContent>
        </Card>
      ) : agenda.isError ? (
        <Card>
          <CardContent className="min-h-40 p-6 text-sm text-destructive">
            Não foi possível carregar toda a agenda jurídica.
            <Button variant="outline" onClick={() => void agenda.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {days.map(({ day, events: dayEvents }) => (
            <Card key={day} className={day === localCivilDate() ? "border-blue-500/35" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="capitalize">{civilDate(day)}</span>
                  <Badge variant="secondary">{dayEvents.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dayEvents.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" />{" "}
                    {(agenda.data?.total ?? 0) > 20
                      ? "Nenhum item deste dia nesta página."
                      : "Nenhum compromisso jurídico."}
                  </div>
                ) : (
                  dayEvents.map((event) => <AgendaItem key={event.id} event={event} />)
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!agenda.isLoading && !agenda.isError && agenda.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            {agenda.data.total} compromissos no período · horário deste aparelho. Datas de prazo são
            dias inteiros.
          </p>
          {agenda.data.total > 20 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span className="text-sm">
                {page} / {Math.ceil(agenda.data.total / 20)}
              </span>
              <Button
                variant="outline"
                disabled={page * 20 >= agenda.data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgendaItem({ event }: { event: LegalAgendaEvent }) {
  const icon =
    event.kind === "hearing" ? Gavel : event.kind === "deadline" ? FileWarning : ListTodo;
  const Icon = icon;
  const time =
    event.kind === "deadline"
      ? "Dia inteiro"
      : new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
          new Date(event.at),
        );
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-muted/15 p-4">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{event.title}</p>
          {event.confidential && <Badge variant="outline">Segredo de justiça</Badge>}
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{event.subtitle}</p>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" /> {time}
        </p>
      </div>
      {event.process_id ? (
        <Button asChild size="icon" variant="ghost" aria-label="Abrir processo">
          <Link to="/processos/$processId" params={{ processId: event.process_id }}>
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button asChild size="icon" variant="ghost" aria-label="Abrir tarefas">
          <Link to="/tarefas">
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Gavel;
  tone: "amber" | "rose" | "blue";
}) {
  const tones = {
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    blue: "bg-blue-500/10 text-blue-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold">{value ?? "—"}</p>
        </div>
        <span className={`grid size-11 place-items-center rounded-2xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
