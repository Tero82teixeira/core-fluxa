import { createFileRoute } from "@tanstack/react-router";

import { useWorkspace } from "@/lib/workspace";
import { useProcesses, useTasks, useRecentActivity } from "@/hooks/use-operations";
import { Card, CardContent } from "@/components/ui/card";
import { PROCESS_STAGE } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/central")({
  head: () => ({
    meta: [
      { title: "Central de Comando — FLUXA" },
      { name: "description", content: "Visão executiva de processos, prazos e tarefas da operação." },
      { property: "og:title", content: "Central de Comando — FLUXA" },
      { property: "og:description", content: "Visão executiva de processos, prazos e tarefas da operação." },
    ],
  }),
  component: Central,
});

function Central() {
  const { organizationId } = useWorkspace();
  const processes = useProcesses(organizationId);
  const tasks = useTasks(organizationId);
  const activity = useRecentActivity(organizationId);

  const rows = processes.data ?? [];
  const open = rows.filter((p) => p.stage !== "finalizado" && p.stage !== "arquivado" && p.stage !== "cancelado");
  const late = open.filter((p) => p.due_date && new Date(p.due_date) < new Date());
  const pendingTasks = (tasks.data ?? []).filter((t) => t.status !== "concluida");

  const metrics = [
    { label: "Processos ativos", value: open.length },
    { label: "Prazos vencidos", value: late.length },
    { label: "Tarefas pendentes", value: pendingTasks.length },
    { label: "Total de processos", value: rows.length },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{metric.label}</p>
              <p className="mt-2 font-display text-3xl font-semibold">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold">Prazos mais próximos</h2>
            <ul className="mt-4 divide-y divide-border">
              {open.slice(0, 8).map((process) => (
                <li key={process.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{process.code} — {process.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{process.clients?.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge label={PROCESS_STAGE[process.stage].label} tone={PROCESS_STAGE[process.stage].tone} />
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(process.due_date)}</p>
                  </div>
                </li>
              ))}
              {open.length === 0 && <li className="py-6 text-sm text-muted-foreground">Nenhum processo ativo.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold">Atividade recente</h2>
            <ul className="mt-4 space-y-4">
              {(activity.data ?? []).slice(0, 8).map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.actor_name ?? "Sistema"} · {relativeTime(item.created_at)}
                  </p>
                </li>
              ))}
              {(activity.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">Sem movimentações registradas.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
