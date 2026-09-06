import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  FileCheck2,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  UserRoundCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useCommunicationThreads } from "@/hooks/use-communication";
import { useTasks } from "@/hooks/use-operations";
import { useStaffPortalServiceCenter } from "@/hooks/use-staff-portal-service-center";
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
};

const kindIcon = {
  task: CheckSquare2,
  communication: MessageSquare,
  triage: UserRoundCheck,
  document: FileCheck2,
};

const urgency = {
  overdue: { label: "Atrasado", tone: "danger" as const },
  today: { label: "Hoje", tone: "warning" as const },
  attention: { label: "Atenção", tone: "warning" as const },
  normal: { label: "Na fila", tone: "neutral" as const },
};

function MyDayPage() {
  const { organizationId, user, role, displayName } = useWorkspace();
  const tasks = useTasks(organizationId);
  const communications = useCommunicationThreads(organizationId);
  const allowedPortal = canWriteCommunication(role);
  const portal = useStaffPortalServiceCenter(organizationId, allowedPortal);
  const canReviewDocuments = role === "proprietario" || role === "administrador";
  const data = buildMyDay({
    tasks: tasks.data ?? [],
    communications: communications.data ?? [],
    portalItems: portal.data ?? [],
    userId: user?.id ?? null,
    canReviewDocuments,
  });
  const queries = [tasks, communications, portal];
  const loading = queries.some((query) => query.isLoading);
  const refreshing = queries.some((query) => query.isFetching);
  const error = queries.some((query) => query.isError);
  const refresh = () => queries.forEach((query) => void query.refetch());

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.11] via-card to-amber-500/[0.08] p-5 shadow-sm sm:p-6">
        <div
          className="pointer-events-none absolute -right-10 -top-20 size-52 rounded-full bg-amber-400/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <CalendarCheck2 className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                  Prioridades pessoais
                </p>
                <h1 className="page-title">Meu Dia</h1>
              </div>
            </div>
            <p className="page-subtitle mt-2">
              Olá, {displayName}. Comece pelo que exige sua atenção agora.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
            Atualizar
          </Button>
        </div>
      </header>

      <section aria-label="Resumo do meu dia" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Atrasados" value={data.summary.overdue} icon={AlertTriangle} critical />
        <Metric label="Para hoje" value={data.summary.today} icon={Clock3} />
        <Metric label="Minhas tarefas" value={data.summary.assignedTasks} icon={CheckSquare2} />
        <Metric
          label="Atendimentos"
          value={data.summary.assignedCommunications}
          icon={MessageSquare}
        />
        <Metric label="Sem responsável" value={data.summary.triage} icon={UserRoundCheck} />
        {canReviewDocuments && (
          <Metric label="Para analisar" value={data.summary.documents} icon={FileCheck2} />
        )}
      </section>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/15">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Fila de prioridades</CardTitle>
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
            <ul className="divide-y">
              {data.items.slice(0, 20).map((item) => {
                const Icon = kindIcon[item.kind];
                const state = urgency[item.urgency];
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="grid gap-3 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                    >
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Shortcut href="/tarefas" label="Abrir minhas tarefas" icon={CheckSquare2} />
        <Shortcut href="/comunicacao" label="Responder clientes" icon={MessageSquare} />
        <Shortcut href="/comunicacao" label="Abrir triagem" icon={Inbox} />
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  critical = false,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  critical?: boolean;
}) {
  return (
    <Card
      className={cn(
        "shadow-sm",
        critical && value > 0 && "border-destructive/30 bg-destructive/[0.03]",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon
            className={cn("size-4 text-primary", critical && value > 0 && "text-destructive")}
            aria-hidden
          />
        </div>
        <p
          className={cn(
            "mt-2 text-2xl font-semibold tabular-nums",
            critical && value > 0 && "text-destructive",
          )}
        >
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
  href: "/tarefas" | "/comunicacao";
  label: string;
  icon: typeof Clock3;
}) {
  return (
    <Button variant="outline" className="min-h-12 justify-start" asChild>
      <Link to={href}>
        <Icon className="size-4" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
