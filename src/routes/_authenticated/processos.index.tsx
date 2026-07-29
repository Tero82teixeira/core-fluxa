import { createFileRoute, Link } from "@tanstack/react-router";

import { useWorkspace } from "@/lib/workspace";
import { useProcesses } from "@/hooks/use-operations";
import { KANBAN_STAGES, PRIORITY, PROCESS_STAGE } from "@/lib/domain";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/processos/")({
  head: () => ({
    meta: [
      { title: "Processos — FLUXA" },
      { name: "description", content: "Acompanhe processos por etapa, prazo e responsável." },
      { property: "og:title", content: "Processos — FLUXA" },
      { property: "og:description", content: "Acompanhe processos por etapa, prazo e responsável." },
    ],
  }),
  component: ProcessesPage,
});

function ProcessesPage() {
  const { organizationId } = useWorkspace();
  const processes = useProcesses(organizationId);
  const rows = processes.data ?? [];

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {KANBAN_STAGES.map((stage) => {
          const items = rows.filter((process) => process.stage === stage);
          return (
            <Card key={stage}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{PROCESS_STAGE[stage].label}</p>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {items.map((process) => (
                    <li key={process.id}>
                      <Link
                        to="/processos/$processId"
                        params={{ processId: process.id }}
                        className="block rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted/60"
                      >
                        <p className="truncate text-sm font-medium">{process.code}</p>
                        <p className="truncate text-xs text-muted-foreground">{process.clients?.name}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <StatusBadge label={PRIORITY[process.priority].label} tone={PRIORITY[process.priority].tone} />
                          <span className="text-[11px] text-muted-foreground">{formatDate(process.due_date)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                  {items.length === 0 && <li className="py-2 text-xs text-muted-foreground">Sem processos.</li>}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
