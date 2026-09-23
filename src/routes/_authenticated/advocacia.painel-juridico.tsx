import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileWarning,
  Gavel,
  ListTodo,
  Loader2,
  RefreshCw,
  Scale,
  UserRoundX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProcesses, useRecentActivity, useTasks } from "@/hooks/use-operations";
import { PROCESS_STAGE } from "@/lib/domain";
import { localCivilDate, summarizeLegalWorkspace } from "@/lib/legal-workspace";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/advocacia/painel-juridico")({
  head: () => ({
    meta: [
      { title: "Painel Jurídico — FLUXA Advocacia" },
      {
        name: "description",
        content: "Carteira de processos, prazos e prioridades da operação jurídica.",
      },
    ],
  }),
  component: LegalWorkspaceDashboardPage,
});

function civilDate(value: string | null | undefined) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function LegalWorkspaceDashboardPage() {
  const { organizationId } = useWorkspace();
  const processes = useProcesses(organizationId);
  const tasks = useTasks(organizationId);
  const activity = useRecentActivity(organizationId);
  const today = localCivilDate();

  const summary = useMemo(
    () =>
      summarizeLegalWorkspace({
        processes: processes.data ?? [],
        tasks: tasks.data ?? [],
        today,
      }),
    [processes.data, tasks.data, today],
  );

  const isLoading = processes.isLoading || tasks.isLoading || activity.isLoading;
  const hasError = processes.isError || tasks.isError || activity.isError;
  const refresh = () => {
    void processes.refetch();
    void tasks.refetch();
    void activity.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 p-5 text-white shadow-xl shadow-indigo-950/10 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-amber-300 text-slate-950 shadow-lg shadow-amber-300/20">
                <Scale className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-amber-200 uppercase">
                  FLUXA Advocacia
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Painel Jurídico
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200">
              Uma visão direta da carteira: processos ativos, prazos prioritários, exigências e
              responsabilidades da equipe.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to="/processos">Abrir Processos</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              onClick={refresh}
            >
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando a operação jurídica…
          </CardContent>
        </Card>
      ) : hasError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <div>
              <p className="font-medium">Não foi possível carregar todo o painel jurídico.</p>
              <p className="text-sm text-muted-foreground">Tente atualizar os indicadores.</p>
            </div>
            <Button type="button" variant="outline" onClick={refresh}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section
            aria-label="Resumo jurídico"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          >
            <MetricCard
              label="Carteira ativa"
              value={summary.activeProcesses.length}
              icon={BriefcaseBusiness}
              tone="blue"
            />
            <MetricCard
              label="Prazos vencidos"
              value={summary.overdueProcesses.length}
              icon={FileWarning}
              tone="rose"
            />
            <MetricCard
              label="Vencem hoje"
              value={summary.dueToday.length}
              icon={Clock3}
              tone="amber"
            />
            <MetricCard
              label="Próximos 7 dias"
              value={summary.dueNextSevenDays.length}
              icon={CalendarClock}
              tone="violet"
            />
            <MetricCard
              label="Em exigência"
              value={summary.inRequirement.length}
              icon={CircleAlert}
              tone="rose"
            />
            <MetricCard
              label="Sem responsável"
              value={summary.withoutOwner.length}
              icon={UserRoundX}
              tone="amber"
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className={summary.urgentProcesses.length ? "border-amber-500/30" : ""}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Gavel className="size-4 text-amber-600" />
                    Prazos prioritários
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vencidos, de hoje e dos próximos sete dias.
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link
                    to="/processos"
                    search={{ etapa: undefined, responsavel: undefined, cliente: undefined }}
                  >
                    Ver processos <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.urgentProcesses.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    text="Nenhum prazo crítico nos próximos sete dias."
                  />
                ) : (
                  summary.urgentProcesses.slice(0, 8).map((process) => (
                    <Link
                      key={process.id}
                      to="/processos/$processId"
                      params={{ processId: process.id }}
                      className="flex flex-col gap-2 rounded-2xl border bg-muted/15 p-4 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{process.title || process.code}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {process.code} · {process.clients?.name || "Cliente não informado"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{PROCESS_STAGE[process.stage].short}</Badge>
                        <span className="text-sm font-medium">{civilDate(process.due_date)}</span>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListTodo className="size-4 text-indigo-500" />
                    Tarefas jurídicas prioritárias
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summary.urgentTasks.length === 0 ? (
                    <EmptyState
                      icon={CheckCircle2}
                      text="Nenhuma tarefa urgente vinculada à operação."
                    />
                  ) : (
                    summary.urgentTasks.slice(0, 6).map((task) => (
                      <div key={task.id} className="rounded-xl border p-3">
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {task.assignee_name || "Sem responsável"} · {civilDate(task.due_at)}
                        </p>
                      </div>
                    ))
                  )}
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/tarefas">Abrir Tarefas</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribuição da carteira</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summary.stageCounts.length === 0 ? (
                    <EmptyState icon={Scale} text="Nenhum processo ativo na carteira." />
                  ) : (
                    summary.stageCounts.slice(0, 7).map((stage) => (
                      <div
                        key={stage.key}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">{stage.label}</span>
                        <Badge variant="secondary">{stage.count}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentações recentes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(activity.data ?? []).length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <EmptyState icon={CheckCircle2} text="Nenhuma movimentação recente registrada." />
                </div>
              ) : (
                (activity.data ?? []).slice(0, 6).map((movement) => (
                  <div key={movement.id} className="rounded-2xl border bg-muted/15 p-4">
                    <p className="line-clamp-2 font-medium">{movement.description}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {movement.processes?.code || "Processo"}
                      {movement.processes?.clients?.name
                        ? ` · ${movement.processes.clients.name}`
                        : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Scale;
  tone: "blue" | "amber" | "rose" | "violet";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className={`grid size-11 place-items-center rounded-2xl ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Scale; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
      <Icon className="size-5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
