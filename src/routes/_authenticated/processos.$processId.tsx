import { createFileRoute } from "@tanstack/react-router";

import { useProcess, useProcessMovements } from "@/hooks/use-operations";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/processos/$processId")({
  head: () => ({
    meta: [
      { title: "Detalhe do processo — FLUXA" },
      { name: "description", content: "Linha do tempo, prazos e dados do processo." },
      { property: "og:title", content: "Detalhe do processo — FLUXA" },
      { property: "og:description", content: "Linha do tempo, prazos e dados do processo." },
    ],
  }),
  component: ProcessDetail,
});

function ProcessDetail() {
  const { processId } = Route.useParams();
  const process = useProcess(processId);
  const movements = useProcessMovements(processId);

  if (!process.data) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando processo…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-6">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold">
              {process.data.code} — {process.data.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {process.data.clients?.name} · Prazo {formatDate(process.data.due_date)} · Responsável {process.data.owner_name ?? "—"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge kind="stage" value={process.data.stage} />
            <StatusBadge kind="priority" value={process.data.priority} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-display text-base font-semibold">Linha do tempo</h3>
          <ul className="mt-4 space-y-4">
            {(movements.data ?? []).map((movement) => (
              <li key={movement.id} className="border-l-2 border-border pl-4">
                <p className="text-sm font-medium">{movement.description}</p>
                <p className="text-xs text-muted-foreground">
                  {movement.actor_name ?? "Sistema"} · {relativeTime(movement.created_at)}
                </p>
              </li>
            ))}
            {(movements.data ?? []).length === 0 && (
              <li className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
