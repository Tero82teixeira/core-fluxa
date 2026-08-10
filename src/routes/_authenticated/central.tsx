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
  head: () => ({ meta: [{ title: "Central de Comando — FLUXA" }] }),
});
const closed = ["finalizado", "arquivado", "cancelado"];
const today = () => new Date().toISOString().slice(0, 10);

function Block({
  title,
  href,
  action,
  loading,
  error,
  children,
}: {
  title: string;
  href: string;
  action: string;
  loading?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={href}>{action}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div aria-label={`Carregando ${title}`} className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar este bloco.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
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
  const metrics: Array<[string, number, string, LucideIcon]> = [
    ["Tarefas atrasadas", taskStats.overdue, "/tarefas", AlertTriangle],
    [
      "Tarefas para hoje",
      openTasks.filter((t) => t.due_at?.slice(0, 10) === today()).length,
      "/tarefas",
      CheckSquare,
    ],
    ["Retornos atrasados", cs.overdue, "/comunicacao", MessageCircle],
    ["Documentos vencendo", documents.data?.expiring ?? 0, "/documentos", FileClock],
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
      ],
      [
        "Alertas críticos",
        alerts.filter((a) => effectivePriority(a) === "critica").length,
        "/monitoramento",
        AlertTriangle,
      ],
    );
  if (canFinance)
    metrics.push(
      [
        "Contas vencidas",
        fs.due.filter((t: any) => t.due_date < today()).length,
        "/financeiro",
        Wallet,
      ],
      [
        "Próximos vencimentos",
        fs.due.filter((t: any) => t.due_date >= today()).length,
        "/financeiro",
        CalendarClock,
      ],
    );
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
      <header className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-title">Central de Comando</h1>
          <p className="page-subtitle">Visão geral da operação da organização.</p>
          <p className="mt-2 text-sm font-medium">
            {org} · {formatDate(new Date().toISOString())}
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="size-3" />
          Dados atualizados{" "}
          {updated
            ? new Date(updated).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "ao carregar"}
        </p>
      </header>
      <section
        aria-label="Indicadores principais"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {metrics.map(([label, value, href, Icon]) => (
          <Link
            key={label}
            to={href}
            aria-label={`${label}: ${value}. Abrir módulo`}
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition hover:border-primary">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <strong className="text-2xl">{value}</strong>
                </div>
                <Icon className="size-5" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        ))}
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
                  <Link to={i.href} className="font-medium hover:underline">
                    {i.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {i.origin} · {i.related || "Sem vínculo"} · {i.responsible || "Não atribuído"} ·{" "}
                    {i.priority} · {i.reason}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum alerta crítico no momento.</p>
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
              <ul className="space-y-2">
                {alerts.slice(0, 5).map((a) => (
                  <li key={`${a.source_id}-${a.alert_kind}`} className="text-sm">
                    <b>{a.title}</b>
                    <p className="text-muted-foreground">
                      {effectivePriority(a)} · {a.monitoring_status} ·{" "}
                      {a.assigned_name || a.responsible_name || "Não atribuído"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum alerta crítico no momento.</p>
            )}
          </Block>
        )}
        <Block
          title="Tarefas"
          href="/tarefas"
          action="Ver todas as tarefas"
          loading={tasks.isLoading}
          error={tasks.isError}
        >
          <p className="mb-3 text-sm">
            {taskStats.overdue} atrasadas ·{" "}
            {openTasks.filter((t) => t.due_at?.slice(0, 10) === today()).length} hoje ·{" "}
            {openTasks.filter((t) => t.due_at && t.due_at.slice(0, 10) > today()).length} próximas
          </p>
          {openTasks.length ? (
            <ul className="space-y-2">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="text-sm">
                  <b>{t.title}</b>
                  <p className="text-muted-foreground">
                    {t.assignee_name || "Não atribuída"} ·{" "}
                    {t.due_at ? formatDate(t.due_at) : "Sem prazo"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>Não há tarefas atrasadas.</p>
          )}
        </Block>
        {canProcesses && (
          <Block
            title="Processos"
            href="/processos"
            action="Ver processos"
            loading={processes.isLoading}
            error={processes.isError}
          >
            <p className="mb-3 text-sm">
              {processRows.length} ativos ·{" "}
              {processRows.filter((p) => p.due_date && p.due_date < today()).length} atrasados ·{" "}
              {processRows.filter((p) => p.priority === "critica").length} críticos
            </p>
            {processRows.length ? (
              <ul className="space-y-2">
                {processRows.slice(0, 5).map((p) => (
                  <li key={p.id} className="text-sm">
                    <b>
                      {p.code} · {p.title}
                    </b>
                    <p className="text-muted-foreground">
                      {p.clients?.name || "Sem cliente"} · {p.owner_name || "Não atribuído"} ·{" "}
                      {p.due_date ? formatDate(p.due_date) : "Sem prazo"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum processo exige atenção.</p>
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
          >
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {[
                ["Saldo atual", fs.balance],
                ["A receber", fs.receivable],
                ["A pagar", fs.payable],
                ["Vencidos", fs.overdue],
                ["Receitas do mês", fs.incomeMonth],
                ["Despesas do mês", fs.expenseMonth],
              ].map(([l, v]) => (
                <div key={String(l)}>
                  <span className="text-muted-foreground">{l}</span>
                  <p className="font-semibold">{brl(Number(v))}</p>
                </div>
              ))}
            </div>
            <h3 className="mt-4 font-semibold">Vencimentos financeiros</h3>
            {fs.due.length ? (
              <ul>
                {fs.due.map((t: any) => (
                  <li key={t.id} className="py-1 text-sm">
                    {t.description} · {brDate(t.due_date)} · {brl(t.remaining)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm">Não há contas vencidas.</p>
            )}
          </Block>
        )}
        <Block
          title="Retornos e comunicação"
          href="/comunicacao"
          action="Ver comunicação"
          loading={communication.isLoading}
          error={communication.isError}
        >
          <p className="mb-3 text-sm">
            {cs.waitingClient} aguardando cliente · {cs.waitingTeam} equipe · {cs.overdue} atrasados
            · {cs.open} abertas
          </p>
          {cs.attention.length ? (
            <ul>
              {cs.attention.map((t: any) => (
                <li key={t.id} className="py-1 text-sm">
                  <b>
                    {t.clients?.name} · {t.subject}
                  </b>
                  <p className="text-muted-foreground">
                    {t.assigned_to || "Não atribuído"} ·{" "}
                    {t.follow_up_at ? formatDate(t.follow_up_at) : "Sem retorno"} · {t.status}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>Todos os retornos estão em dia.</p>
          )}
        </Block>
        <Block
          title="Documentos"
          href="/documentos"
          action="Ver documentos"
          loading={documents.isLoading}
          error={documents.isError}
        >
          <p>
            {documents.data?.expired ?? 0} vencidos · {documents.data?.expiring ?? 0} vencendo ·{" "}
            {documents.data?.pending ?? 0} pendentes
          </p>
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
              <ul>
                {activity.data.slice(0, 5).map((a) => (
                  <li key={a.id} className="py-1 text-sm">
                    {a.description} ·{" "}
                    <span className="text-muted-foreground">{a.actor_name || "Sistema"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma atividade recente.</p>
            )}
          </Block>
        )}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Atalhos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {can("clients.create") && (
            <Button asChild>
              <Link to="/clientes/novo">
                <Plus />
                Novo cliente
              </Link>
            </Button>
          )}
          {can("processes.create") && (
            <Button asChild>
              <Link to="/processos/novo">
                <Plus />
                Novo processo
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/tarefas">
              <Plus />
              Nova tarefa
            </Link>
          </Button>
          {canFinance && (
            <Button variant="outline" asChild>
              <Link to="/financeiro">
                <Plus />
                Novo lançamento
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/comunicacao">
              <Plus />
              Nova conversa
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
