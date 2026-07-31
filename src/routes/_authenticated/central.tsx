import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileStack,
  Flame,
  PauseCircle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { useClients, useCompleteTask, useProcesses, useRecentActivity, useTasks } from "@/hooks/use-operations";
import type { DemoProcess } from "@/lib/demo-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/status-badge";
import { PIPELINE_STAGES, PRIORITY, PROCESS_STAGE, type ProcessStage } from "@/lib/domain";
import {
  daysUntil,
  firstName,
  formatCompactCurrency,
  formatDate,
  formatTime,
  greeting,
  relativeTime,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/central")({
  head: () => ({
    meta: [
      { title: "Central de Comando — FLUXA" },
      { name: "description", content: "Visão executiva de processos, prazos, prioridades e tarefas da operação." },
      { property: "og:title", content: "Central de Comando — FLUXA" },
      { property: "og:description", content: "Visão executiva de processos, prazos, prioridades e tarefas da operação." },
    ],
  }),
  component: Central,
});

const CLOSED: ProcessStage[] = ["finalizado", "arquivado", "cancelado"];

const isStale = (process: DemoProcess) => {
  const days = daysUntil(process.last_movement_at);
  return days !== null && days <= -14;
};

function Central() {
  const navigate = useNavigate();
  const { organizationId, displayName } = useWorkspace();
  const processes = useProcesses(organizationId);
  const clients = useClients(organizationId);
  const tasks = useTasks(organizationId);
  const activity = useRecentActivity(organizationId);
  const completeTask = useCompleteTask(organizationId);
  const [drawer, setDrawer] = useState<string | null>(null);

  const rows = processes.data ?? [];
  const open = rows.filter((process) => !CLOSED.includes(process.stage));

  const groups = useMemo(() => {
    const critical = open.filter((process) => {
      const days = daysUntil(process.due_date);
      return days !== null && days <= 2;
    });
    return {
      urgentes: open.filter((process) => process.priority === "critica"),
      hoje: open.filter((process) => daysUntil(process.due_date) === 0),
      aguardando: open.filter((process) => process.stage === "aguardando_documentos"),
      parados: open.filter(isStale),
      oportunidades: open.filter((process) => process.financial_status === "pendente" && process.stage === "novo"),
      criticos: critical,
    };
  }, [open]);

  const pendingTasks = (tasks.data ?? []).filter((task) => task.status !== "concluida");
  const activeClients = (clients.data ?? []).filter((client) => client.status === "ativo");
  const forecast = open.reduce((total, process) => total + (process.value ?? 0), 0);

  const metrics = [
    {
      key: "ativos",
      label: "Processos ativos",
      value: open.length,
      description: "Em andamento em todas as etapas",
      trend: "+8%",
      up: true,
      comparison: "vs. período anterior",
      tooltip: "Processos que ainda não foram finalizados, arquivados ou cancelados.",
      icon: FileStack,
      onClick: () => navigate({ to: "/processos" }),
    },
    {
      key: "documentos",
      label: "Aguardando documentos",
      value: groups.aguardando.length,
      description: "Dependem de envio do cliente",
      trend: "-2",
      up: false,
      comparison: "vs. semana passada",
      tooltip: "Processos parados na etapa de coleta documental.",
      icon: Clock3,
      onClick: () => setDrawer("aguardando"),
    },
    {
      key: "analise",
      label: "Em análise",
      value: open.filter((p) => p.stage === "em_analise").length,
      description: "Sob avaliação dos órgãos",
      trend: "+3",
      up: true,
      comparison: "vs. semana passada",
      tooltip: "Processos protocolados e em análise pelo órgão competente.",
      icon: Sparkles,
      onClick: () => navigate({ to: "/processos", search: { etapa: "em_analise" } }),
    },
    {
      key: "prazos",
      label: "Prazos críticos",
      value: groups.criticos.length,
      description: "Vencem em até 2 dias ou atrasados",
      trend: "+1",
      up: false,
      comparison: "vs. ontem",
      tooltip: "Considera prazos vencidos e os que vencem nas próximas 48 horas.",
      icon: AlertTriangle,
      onClick: () => setDrawer("criticos"),
    },
    {
      key: "clientes",
      label: "Clientes ativos",
      value: activeClients.length,
      description: "Com relacionamento em curso",
      trend: "+2",
      up: true,
      comparison: "vs. mês anterior",
      tooltip: "Clientes com status ativo na carteira.",
      icon: Users,
      onClick: () => navigate({ to: "/clientes" }),
    },
    {
      key: "receita",
      label: "Receita prevista",
      value: formatCompactCurrency(forecast),
      description: "Somatório dos processos ativos",
      trend: "+12%",
      up: true,
      comparison: "vs. mês anterior",
      tooltip: "Valor contratado dos processos que seguem em andamento.",
      icon: Wallet,
      onClick: () => navigate({ to: "/financeiro" }),
    },
  ];

  const pulse = [
    { key: "urgentes", label: "Urgentes", count: groups.urgentes.length, icon: Flame, tone: "danger" as const },
    { key: "hoje", label: "Vencem hoje", count: groups.hoje.length, icon: CalendarClock, tone: "warning" as const },
    { key: "aguardando", label: "Aguardando cliente", count: groups.aguardando.length, icon: Clock3, tone: "caution" as const },
    { key: "parados", label: "Sem movimentação", count: groups.parados.length, icon: PauseCircle, tone: "neutral" as const },
    { key: "oportunidades", label: "Oportunidades", count: groups.oportunidades.length, icon: Sparkles, tone: "info" as const },
  ];

  const radar = useMemo(() => {
    const score = (process: DemoProcess) => {
      const days = daysUntil(process.due_date) ?? 99;
      const priorityWeight = { critica: 0, alta: 1, media: 2, baixa: 3 }[process.priority];
      return days * 2 + priorityWeight;
    };
    return [...open].sort((a, b) => score(a) - score(b)).slice(0, 5);
  }, [open]);

  const agenda = [...(tasks.data ?? [])].sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));

  const drawerItems = drawer ? (groups[drawer as keyof typeof groups] ?? []) : [];
  const drawerTitles: Record<string, string> = {
    urgentes: "Processos urgentes",
    hoje: "Prazos que vencem hoje",
    aguardando: "Aguardando o cliente",
    parados: "Sem movimentação há 14 dias ou mais",
    oportunidades: "Oportunidades comerciais",
    criticos: "Prazos críticos",
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
        <header>
          <h2 className="font-display text-xl font-semibold text-balance sm:text-2xl">
            {greeting()}, {firstName(displayName)}. Aqui está o pulso da sua operação.
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Você possui {radar.length} prioridades, {groups.criticos.length} prazos críticos e{" "}
            {groups.aguardando.length + groups.parados.length} processos aguardando ação.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <Tooltip key={metric.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={metric.onClick}
                  className="rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition hover:border-brand/40 hover:shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {metric.label}
                        </p>
                        <metric.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </div>
                      <p className="mt-2 font-display text-3xl font-semibold">{metric.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{metric.description}</p>
                      <p
                        className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${
                          metric.up ? "text-success" : "text-caution"
                        }`}
                      >
                        {metric.up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                        {metric.trend}
                        <span className="font-normal text-muted-foreground">{metric.comparison}</span>
                      </p>
                    </CardContent>
                  </Card>
                </button>
              </TooltipTrigger>
              <TooltipContent>{metric.tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Pulso da operação</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {pulse.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setDrawer(item.key)}
                className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-brand/40 hover:bg-muted/40"
              >
                <item.icon className="size-4 text-muted-foreground" aria-hidden />
                <p className="mt-3 font-display text-2xl font-semibold">{item.count}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-semibold">Radar de prioridades</h3>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/processos">Ver todos</Link>
                </Button>
              </div>
              <ul className="mt-4 space-y-3">
                {radar.map((process) => {
                  const days = daysUntil(process.due_date);
                  const risk =
                    days !== null && days < 0 ? "Risco alto" : days !== null && days <= 2 ? "Risco médio" : "Sob controle";
                  const riskTone = risk === "Risco alto" ? "danger" : risk === "Risco médio" ? "warning" : "success";
                  return (
                    <li key={process.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{process.clients?.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {process.code} · {process.service_types?.name}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <StatusBadge label={PRIORITY[process.priority].label} tone={PRIORITY[process.priority].tone} />
                          <StatusBadge label={risk} tone={riskTone} />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Motivo: {process.next_action}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Prazo {formatDate(process.due_date)}</span>
                        <span>Responsável {process.owner_name}</span>
                      </div>
                      <div className="mt-3">
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/processos/$processId" params={{ processId: process.id }}>
                            Abrir processo
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-display text-base font-semibold">Pipeline</h3>
                <ul className="mt-4 space-y-3">
                  {PIPELINE_STAGES.map((stage) => {
                    const count = open.filter((process) => stage.key.includes(process.stage)).length;
                    const pct = open.length ? Math.round((count / open.length) * 100) : 0;
                    return (
                      <li key={stage.label}>
                        <Link
                          to="/processos"
                          search={{ etapa: stage.key[0] }}
                          className="block rounded-md p-1 transition hover:bg-muted/50"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{stage.label}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <Progress value={pct} className="mt-1.5 h-1.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-display text-base font-semibold">Agenda operacional</h3>
                <ul className="mt-4 space-y-3">
                  {agenda.map((task) => (
                    <li key={task.id} className="flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={`Concluir ${task.title}`}
                        disabled={task.status === "concluida"}
                        onClick={() => completeTask.mutate(task.id)}
                        className="mt-0.5 shrink-0 text-muted-foreground transition hover:text-success disabled:text-success"
                      >
                        <CheckCircle2 className="size-4" aria-hidden />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            task.status === "concluida" ? "text-muted-foreground line-through" : "font-medium"
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatTime(task.due_at)} · {task.clients?.name} · {task.assignee_name}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Conclusões valem apenas nesta sessão de demonstração.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-display text-base font-semibold">Atividade recente</h3>
            <ul className="mt-4 space-y-4">
              {(activity.data ?? []).slice(0, 10).map((item) => (
                <li key={item.id} className="border-l-2 border-border pl-4">
                  <p className="text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.processes?.code} · {item.processes?.clients?.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.actor_name ?? "Sistema"} · {relativeTime(item.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Sheet open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{drawer ? drawerTitles[drawer] : ""}</SheetTitle>
              <SheetDescription>{drawerItems.length} registro(s) nesta seleção.</SheetDescription>
            </SheetHeader>
            <ul className="space-y-2 px-4 pb-6">
              {drawerItems.map((process) => (
                <li key={process.id}>
                  <Link
                    to="/processos/$processId"
                    params={{ processId: process.id }}
                    onClick={() => setDrawer(null)}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{process.clients?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {process.code} · {PROCESS_STAGE[process.stage].label}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Prazo {formatDate(process.due_date)}</p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
              {drawerItems.length === 0 && (
                <li className="py-6 text-sm text-muted-foreground">Nenhum registro nesta seleção.</li>
              )}
            </ul>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

export function Unused(): ReactNode {
  return null;
}
