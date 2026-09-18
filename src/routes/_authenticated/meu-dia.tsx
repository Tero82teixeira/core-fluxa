import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  FileCheck2,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { GettingStartedCard } from "@/components/onboarding/getting-started-card";
import { useCommunicationThreads } from "@/hooks/use-communication";
import { useTasks } from "@/hooks/use-operations";
import { useStaffPortalServiceCenter } from "@/hooks/use-staff-portal-service-center";
import { useCommercialOpportunityAlerts } from "@/hooks/use-reports";
import { usePlatformTrialFollowUpAlerts } from "@/hooks/use-commercial-follow-up";
import { canWriteCommunication } from "@/lib/communication";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildMyDay, type MyDayItem } from "@/lib/my-day";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/meu-dia")({
  component: MyDayPage,
  head: () => ({
    meta: [
      { title: "Meu Dia — FLUXA" },
      { name: "description", content: "Prioridades pessoais e próximos atendimentos no FLUXA." },
    ],
  }),
});

const kindLabel: Record<MyDayItem["kind"], string> = {
  task: "Tarefa",
  communication: "Atendimento",
  triage: "Triagem",
  document: "Documento",
  commercial: "Comercial",
  platform_trial: "Teste FLUXA",
};

const kindIcon = {
  task: CheckSquare2,
  communication: MessageSquare,
  triage: UserRoundCheck,
  document: FileCheck2,
  commercial: BriefcaseBusiness,
  platform_trial: Building2,
};

const urgency = {
  overdue: { label: "Atrasado", tone: "danger" as const },
  today: { label: "Hoje", tone: "warning" as const },
  attention: { label: "Atenção", tone: "warning" as const },
  normal: { label: "Na fila", tone: "neutral" as const },
};

function MyDayPage() {
  const { organizationId, user, role, displayName, platformAdmin } = useWorkspace();
  const tasks = useTasks(organizationId);
  const communications = useCommunicationThreads(organizationId);
  const allowedPortal = canWriteCommunication(role);
  const portal = useStaffPortalServiceCenter(organizationId, allowedPortal);
  const opportunities = useCommercialOpportunityAlerts(organizationId);
  const platformTrials = usePlatformTrialFollowUpAlerts(platformAdmin);
  const canReviewDocuments = role === "proprietario" || role === "administrador";
  const data = buildMyDay({
    tasks: tasks.data ?? [],
    communications: communications.data ?? [],
    portalItems: portal.data ?? [],
    userId: user?.id ?? null,
    canReviewDocuments,
    opportunities: opportunities.data ?? [],
    platformTrials: platformTrials.data ?? [],
  });
  const queries = [tasks, communications, portal, opportunities, platformTrials];
  const loading = queries.some((query) => query.isLoading);
  const refreshing = queries.some((query) => query.isFetching);
  const error = queries.some((query) => query.isError);
  const refresh = () => queries.forEach((query) => void query.refetch());

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-amber-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20 ring-1 ring-white/10">
                <CalendarCheck2 className="size-5" aria-hidden />
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-amber-300 uppercase">
                  <Sparkles className="size-3.5" aria-hidden />
                  Prioridades pessoais
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                  Meu Dia
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Olá, {displayName}. Comece pelo que exige sua atenção agora.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            className="min-h-10 rounded-xl border-white/15 bg-white/[0.07] text-white shadow-sm hover:bg-white/[0.12] hover:text-white"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
            Atualizar
          </Button>
        </div>
      </header>

      <GettingStartedCard />

      <section
        aria-label="Resumo do meu dia"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8"
      >
        <Metric label="Atrasados" value={data.summary.overdue} icon={AlertTriangle} tone="rose" />
        <Metric label="Para hoje" value={data.summary.today} icon={Clock3} tone="amber" />
        <Metric
          label="Minhas tarefas"
          value={data.summary.assignedTasks}
          icon={CheckSquare2}
          tone="blue"
        />
        <Metric
          label="Atendimentos"
          value={data.summary.assignedCommunications}
          icon={MessageSquare}
          tone="cyan"
        />
        <Metric
          label="Sem responsável"
          value={data.summary.triage}
          icon={UserRoundCheck}
          tone="violet"
        />
        {canReviewDocuments && (
          <Metric
            label="Para analisar"
            value={data.summary.documents}
            icon={FileCheck2}
            tone="indigo"
          />
        )}
        <Metric
          label="Retornos comerciais"
          value={data.summary.commercial}
          icon={BriefcaseBusiness}
          tone="emerald"
        />
        {platformAdmin && (
          <Metric
            label="Testes para contatar"
            value={data.summary.platformTrials}
            icon={Building2}
            tone="sky"
          />
        )}
      </section>

      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-soft">
        <CardHeader className="border-b border-border/60 bg-muted/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="font-display text-lg tracking-tight">
                Fila de prioridades
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Itens atrasados, de hoje e aguardando sua ação aparecem primeiro.
              </p>
            </div>
            <StatusBadge label={`${data.items.length} item(ns)`} tone="info" dot={false} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Montando seu dia…
            </div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-destructive">
              Não foi possível carregar todas as prioridades. Atualize para tentar novamente.
            </div>
          ) : data.items.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="size-6" aria-hidden />
              </span>
              <h2 className="mt-3 font-semibold">Tudo em dia</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Você não tem tarefas, retornos ou atendimentos pendentes nesta fila.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.items.slice(0, 20).map((item) => {
                const Icon = kindIcon[item.kind];
                const state = urgency[item.urgency];
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="grid gap-3 p-4 transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5"
                    >
                      <span className="grid size-10 place-items-center rounded-xl border border-primary/10 bg-primary/8 text-primary shadow-sm">
                        <Icon className="size-4.5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm">{item.title}</strong>
                          <StatusBadge label={kindLabel[item.kind]} tone="neutral" dot={false} />
                          <StatusBadge label={state.label} tone={state.tone} />
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {item.context}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground sm:text-right">
                        {item.deadline
                          ? item.deadline.includes("T")
                            ? formatDateTime(item.deadline)
                            : formatDate(item.deadline)
                          : "Sem prazo"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Shortcut href="/tarefas" label="Abrir minhas tarefas" icon={CheckSquare2} />
        <Shortcut href="/comunicacao" label="Responder clientes" icon={MessageSquare} />
        <Shortcut href="/comunicacao" label="Abrir triagem" icon={Inbox} />
        <Shortcut href="/relatorios" label="Abrir funil comercial" icon={BriefcaseBusiness} />
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  tone: "rose" | "amber" | "blue" | "cyan" | "violet" | "indigo" | "emerald" | "sky";
}) {
  const tones = {
    rose: {
      accent: "bg-rose-500",
      icon: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
      value: "text-rose-700 dark:text-rose-300",
    },
    amber: {
      accent: "bg-amber-500",
      icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
      value: "text-amber-700 dark:text-amber-300",
    },
    blue: {
      accent: "bg-blue-500",
      icon: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
      value: "text-blue-700 dark:text-blue-300",
    },
    cyan: {
      accent: "bg-cyan-500",
      icon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
      value: "text-cyan-700 dark:text-cyan-300",
    },
    violet: {
      accent: "bg-violet-500",
      icon: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
      value: "text-violet-700 dark:text-violet-300",
    },
    indigo: {
      accent: "bg-indigo-500",
      icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
      value: "text-indigo-700 dark:text-indigo-300",
    },
    emerald: {
      accent: "bg-emerald-500",
      icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
      value: "text-emerald-700 dark:text-emerald-300",
    },
    sky: {
      accent: "bg-sky-500",
      icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
      value: "text-sky-700 dark:text-sky-300",
    },
  }[tone];
  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/70 bg-card shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-panel">
      <span
        className={cn("absolute left-4 top-0 h-1 w-8 rounded-b-full", tones.accent)}
        aria-hidden
      />
      <CardContent className="p-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className={cn("grid size-8 place-items-center rounded-lg", tones.icon)}>
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p className={cn("mt-2 font-display text-2xl font-semibold tabular-nums", tones.value)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Shortcut({
  href,
  label,
  icon: Icon,
}: {
  href: "/tarefas" | "/comunicacao" | "/relatorios";
  label: string;
  icon: typeof Clock3;
}) {
  return (
    <Button
      variant="outline"
      className="group min-h-14 justify-start rounded-xl border-border/70 bg-card px-4 shadow-soft hover:border-primary/20 hover:bg-card hover:shadow-panel"
      asChild
    >
      <Link to={href}>
        <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="flex-1 text-left">{label}</span>
        <ArrowRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </Button>
  );
}
