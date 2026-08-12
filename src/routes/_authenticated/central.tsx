import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  FileClock,
  FileStack,
  MessageCircle,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";
import { useProcesses, useRecentActivity, useTasks } from "@/hooks/use-operations";
import { useOperationalMonitoring } from "@/hooks/use-monitoring-center";
import { useFinance } from "@/hooks/use-finance";
import { useCommunicationThreads } from "@/hooks/use-communication";
import { useDocumentsSummary } from "@/hooks/use-documents";
import { monitoringAttention, financeSummary, communicationSummary } from "@/lib/command-center";
import { effectivePriority } from "@/lib/monitoring";
import { taskIndicators } from "@/lib/tasks";
import { brl, brDate } from "@/lib/finance";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/central")({
  component: Central,
  head: () => ({
    meta: [
      { title: "Central de Comando — FLUXA" },
      {
        name: "description",
        content: "Painel operacional da FLUXA com prazos, alertas e indicadores da organização.",
      },
    ],
  }),
});
const closed = ["finalizado", "arquivado", "cancelado"];
const today = () => new Date().toISOString().slice(0, 10);

type Level = "critico" | "atencao" | "normal";
const levelCard: Record<Level, string> = {
  critico: "border-destructive/40 bg-destructive/[0.04]",
  atencao: "border-warning/40 bg-warning/[0.05]",
  normal: "",
};
const levelValue: Record<Level, string> = {
  critico: "text-destructive",
  atencao: "text-warning",
  normal: "text-foreground",
};
const levelIcon: Record<Level, string> = {
  critico: "bg-destructive/10 text-destructive",
  atencao: "bg-warning/10 text-warning",
  normal: "bg-muted text-muted-foreground",
};
const priorityTone: Record<string, Tone> = {
  critica: "danger",
  alta: "caution",
  media: "info",
  baixa: "neutral",
};
const priorityLabel: Record<string, string> = {
  critica: "Crítico",
  alta: "Alto",
  media: "Médio",
  baixa: "Baixo",
};

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function Block({
  title,
  href,
  action,
  loading,
  error,
  summary,
  children,
}: {
  title: string;
  href: string;
  action: string;
  loading?: boolean;
  error?: boolean;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b pb-3">
        <CardTitle className="truncate text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" className="shrink-0" asChild>
          <Link to={href}>{action}</Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div aria-label={`Carregando ${title}`} className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            Não foi possível carregar este bloco.
          </p>
        ) : (
          <div className="space-y-3">
            {summary}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stats({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
          <dt className="truncate text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Row({
  title,
  meta,
  right,
}: {
  title: React.ReactNode;
  meta: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      {right && <div className="shrink-0 text-xs text-muted-foreground">{right}</div>}
    </li>
  );
}

function Central() {
  const { organizationId, membership, can } = useWorkspace();
  const canProcesses = can("processes.view"),
    canFinance = can("finance.view");
  const tasks = useTasks(organizationId);
  const processes = useProcesses(canProcesses ? organizationId : null);
  const monitoring = useOperationalMonitoring(canProcesses ? organizationId : null);
  const finance = useFinance(canFinance ? organizationId : null);
  const communication = useCommunicationThreads(organizationId);
  const documents = useDocumentsSummary(organizationId);
  const activity = useRecentActivity(canProcesses ? organizationId : null);
  const taskStats = taskIndicators(tasks.data ?? []);
  const openTasks = (tasks.data ?? []).filter((t) => t.status !== "concluida");
  const processRows = (processes.data ?? []).filter((p) => !closed.includes(p.stage));
  const attention = monitoringAttention(monitoring.data ?? []).slice(0, 8);
  const fs = financeSummary(finance.data);
  const cs = communicationSummary(communication.data ?? []);
  const alerts = (monitoring.data ?? []).filter(
    (a) => !["resolvido", "ignorado"].includes(a.monitoring_status),
  );
  const org =
    membership?.organizations?.trade_name || membership?.organizations?.legal_name || "Organização";
  const metrics: Array<[string, number, string, LucideIcon, Level]> = [
    ["Tarefas atrasadas", taskStats.overdue, "/tarefas", AlertTriangle, "critico"],
    [
      "Tarefas para hoje",
      openTasks.filter((t) => t.due_at?.slice(0, 10) === today()).length,
      "/tarefas",
      CheckSquare,
      "atencao",
    ],
    ["Retornos atrasados", cs.overdue, "/comunicacao", MessageCircle, "atencao"],
    ["Documentos vencendo", documents.data?.expiring ?? 0, "/documentos", FileClock, "atencao"],
  ];
  if (canProcesses)
    metrics.splice(
      2,
      0,
      [
        "Processos críticos",
        processRows.filter((p) => p.priority === "critica").length,
        "/processos",
        FileStack,
        "critico",
      ],
      [
        "Alertas críticos",
        alerts.filter((a) => effectivePriority(a) === "critica").length,
        "/monitoramento",
        AlertTriangle,
        "critico",
      ],
    );
  if (canFinance)
    metrics.push(
      [
        "Contas vencidas",
        fs.due.filter((t: any) => t.due_date < today()).length,
        "/financeiro",
        Wallet,
        "critico",
      ],
      [
        "Próximos vencimentos",
        fs.due.filter((t: any) => t.due_date >= today()).length,
        "/financeiro",
        CalendarClock,
        "normal",
      ],
    );
  const queries = [tasks, processes, monitoring, finance, communication, documents, activity];
  const refreshing = queries.some((q) => q.isFetching);
  const refresh = () => queries.forEach((q) => void q.refetch());
  const updated = Math.max(
    ...[
      tasks.dataUpdatedAt,
      processes.dataUpdatedAt,
      monitoring.dataUpdatedAt,
      finance.dataUpdatedAt,
      communication.dataUpdatedAt,
      documents.dataUpdatedAt,
    ].filter(Boolean),
  );
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <h1 className="page-title">Central de Comando</h1>
          <p className="page-subtitle mt-1">
            Visão geral da operação da organização: prazos, alertas e pendências em um só lugar.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">{org}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatDate(new Date().toISOString())}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <p className="text-xs text-muted-foreground">
            Dados atualizados{" "}
            {updated
              ? new Date(updated).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : "ao carregar"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Atualizar dados da Central de Comando"
            className="min-h-9"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
            Atualizar
          </Button>
        </div>
      </header>
      <section
        aria-label="Indicadores principais"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {metrics.map(([label, value, href, Icon, base]) => {
          const level: Level = value === 0 ? "normal" : base;
          return (
            <Link
              key={label}
              to={href}
              aria-label={`${label}: ${value}. Abrir módulo`}
              className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Card
                className={cn(
                  "h-full transition-colors hover:border-primary",
                  levelCard[level],
                )}
              >
                <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {label}
                    </p>
                    <strong
                      className={cn(
                        "mt-1 block text-3xl leading-none font-semibold tabular-nums",
                        value === 0 ? "text-muted-foreground" : levelValue[level],
                      )}
                    >
                      {value}
                    </strong>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {value === 0 ? "Nada pendente" : "Requer acompanhamento"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-lg",
                      levelIcon[level],
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
      {canProcesses && (
        <Block
          title="Precisa de atenção"
          href="/monitoramento"
          action="Ver alertas"
          loading={monitoring.isLoading}
          error={monitoring.isError}
        >
          {attention.length ? (
            <ul className="divide-y">
              {attention.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={i.href}
                          className="truncate text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {i.title}
                        </Link>
                        <StatusBadge
                          label={priorityLabel[i.priority] ?? i.priority}
                          tone={priorityTone[i.priority] ?? "neutral"}
                        />
                        <StatusBadge label={i.origin} tone="neutral" dot={false} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{i.reason}</p>
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-right">
                      <p className="truncate">{i.related || "Sem vínculo"}</p>
                      <p className="truncate">{i.responsible || "Não atribuído"}</p>
                      <p>{i.deadline ? formatDate(i.deadline) : "Sem prazo"}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum alerta crítico no momento.</Empty>
          )}
        </Block>
      )}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canProcesses && (
          <Block
            title="Alertas do Monitoramento"
            href="/monitoramento"
            action="Ver todos os alertas"
            loading={monitoring.isLoading}
            error={monitoring.isError}
          >
            {alerts.length ? (
              <ul className="divide-y">
                {alerts.slice(0, 5).map((a) => (
                  <Row
                    key={`${a.source_id}-${a.alert_kind}`}
                    title={a.title}
                    meta={`${a.monitoring_status} · ${a.assigned_name || a.responsible_name || "Não atribuído"}`}
                    right={
                      <StatusBadge
                        label={priorityLabel[effectivePriority(a)] ?? effectivePriority(a)}
                        tone={priorityTone[effectivePriority(a)] ?? "neutral"}
                      />
                    }
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nenhum alerta crítico no momento.</Empty>
            )}
          </Block>
        )}
        <Block
          title="Tarefas"
          href="/tarefas"
          action="Ver todas as tarefas"
          loading={tasks.isLoading}
          error={tasks.isError}
          summary={
            <Stats
              items={[
                ["Atrasadas", taskStats.overdue],
                ["Hoje", openTasks.filter((t) => t.due_at?.slice(0, 10) === today()).length],
                [
                  "Próximas",
                  openTasks.filter((t) => t.due_at && t.due_at.slice(0, 10) > today()).length,
                ],
              ]}
            />
          }
        >
          {openTasks.length ? (
            <ul className="divide-y">
              {openTasks.slice(0, 5).map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  meta={t.assignee_name || "Não atribuída"}
                  right={t.due_at ? formatDate(t.due_at) : "Sem prazo"}
                />
              ))}
            </ul>
          ) : (
            <Empty>Não há tarefas atrasadas.</Empty>
          )}
        </Block>
        {canProcesses && (
          <Block
            title="Processos"
            href="/processos"
            action="Ver processos"
            loading={processes.isLoading}
            error={processes.isError}
            summary={
              <Stats
                items={[
                  ["Ativos", processRows.length],
                  [
                    "Atrasados",
                    processRows.filter((p) => p.due_date && p.due_date < today()).length,
                  ],
                  ["Críticos", processRows.filter((p) => p.priority === "critica").length],
                ]}
              />
            }
          >
            {processRows.length ? (
              <ul className="divide-y">
                {processRows.slice(0, 5).map((p) => (
                  <Row
                    key={p.id}
                    title={`${p.code} · ${p.title}`}
                    meta={`${p.clients?.name || "Sem cliente"} · ${p.owner_name || "Não atribuído"}`}
                    right={p.due_date ? formatDate(p.due_date) : "Sem prazo"}
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nenhum processo exige atenção.</Empty>
            )}
          </Block>
        )}
        {canFinance && (
          <Block
            title="Financeiro"
            href="/financeiro"
            action="Ver financeiro"
            loading={finance.isLoading}
            error={finance.isError}
            summary={
              <Stats
                items={[
                  ["Saldo atual", brl(Number(fs.balance))],
                  ["A receber", brl(Number(fs.receivable))],
                  ["A pagar", brl(Number(fs.payable))],
                  ["Vencidos", brl(Number(fs.overdue))],
                  ["Receitas do mês", brl(Number(fs.incomeMonth))],
                  ["Despesas do mês", brl(Number(fs.expenseMonth))],
                ]}
              />
            }
          >
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Vencimentos financeiros
            </h3>
            {fs.due.length ? (
              <ul className="divide-y">
                {fs.due.map((t: any) => (
                  <Row
                    key={t.id}
                    title={t.description}
                    meta={brDate(t.due_date)}
                    right={
                      <span className="font-medium tabular-nums text-foreground">
                        {brl(t.remaining)}
                      </span>
                    }
                  />
                ))}
              </ul>
            ) : (
              <Empty>Não há contas vencidas.</Empty>
            )}
          </Block>
        )}
        <Block
          title="Retornos e comunicação"
          href="/comunicacao"
          action="Ver comunicação"
          loading={communication.isLoading}
          error={communication.isError}
          summary={
            <Stats
              items={[
                ["Aguardando cliente", cs.waitingClient],
                ["Aguardando equipe", cs.waitingTeam],
                ["Atrasados", cs.overdue],
                ["Abertas", cs.open],
              ]}
            />
          }
        >
          {cs.attention.length ? (
            <ul className="divide-y">
              {cs.attention.map((t: any) => (
                <Row
                  key={t.id}
                  title={`${t.clients?.name ?? "—"} · ${t.subject}`}
                  meta={`${t.assigned_to || "Não atribuído"} · ${t.status}`}
                  right={t.follow_up_at ? formatDate(t.follow_up_at) : "Sem retorno"}
                />
              ))}
            </ul>
          ) : (
            <Empty>Todos os retornos estão em dia.</Empty>
          )}
        </Block>
        <Block
          title="Documentos"
          href="/documentos"
          action="Ver documentos"
          loading={documents.isLoading}
          error={documents.isError}
        >
          <Stats
            items={[
              ["Vencidos", documents.data?.expired ?? 0],
              ["Vencendo", documents.data?.expiring ?? 0],
              ["Pendentes", documents.data?.pending ?? 0],
            ]}
          />
        </Block>
        {canProcesses && (
          <Block
            title="Atividade recente"
            href="/processos"
            action="Ver processos"
            loading={activity.isLoading}
            error={activity.isError}
          >
            {activity.data?.length ? (
              <ul className="divide-y">
                {activity.data.slice(0, 5).map((a) => (
                  <Row key={a.id} title={a.description} meta={a.actor_name || "Sistema"} />
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma atividade recente.</Empty>
            )}
          </Block>
        )}
      </section>
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-base">Atalhos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 pt-4 sm:grid-cols-2 lg:grid-cols-5">
          {can("clients.create") && (
            <Button className="min-h-11 w-full justify-start" asChild>
              <Link to="/clientes/novo">
                <Plus aria-hidden />
                Novo cliente
              </Link>
            </Button>
          )}
          {can("processes.create") && (
            <Button className="min-h-11 w-full justify-start" asChild>
              <Link to="/processos/novo">
                <Plus aria-hidden />
                Novo processo
              </Link>
            </Button>
          )}
          <Button variant="outline" className="min-h-11 w-full justify-start" asChild>
            <Link to="/tarefas">
              <Plus aria-hidden />
              Nova tarefa
            </Link>
          </Button>
          {canFinance && (
            <Button variant="outline" className="min-h-11 w-full justify-start" asChild>
              <Link to="/financeiro">
                <Plus aria-hidden />
                Novo lançamento
              </Link>
            </Button>
          )}
          <Button variant="outline" className="min-h-11 w-full justify-start" asChild>
            <Link to="/comunicacao">
              <Plus aria-hidden />
              Nova conversa
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
