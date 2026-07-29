import { createFileRoute } from "@tanstack/react-router";

import { useClient, useProcesses } from "@/hooks/use-operations";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { PROCESS_STAGE, CLIENT_STATUS } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, maskDocument } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes/$clientId")({
  head: () => ({
    meta: [
      { title: "Ficha do cliente — FLUXA" },
      { name: "description", content: "Dados cadastrais, contatos e processos vinculados ao cliente." },
      { property: "og:title", content: "Ficha do cliente — FLUXA" },
      { property: "og:description", content: "Dados cadastrais, contatos e processos vinculados ao cliente." },
    ],
  }),
  component: ClientDetail,
});

function ClientDetail() {
  const { clientId } = Route.useParams();
  const { organizationId } = useWorkspace();
  const client = useClient(clientId);
  const processes = useProcesses(organizationId);
  const related = (processes.data ?? []).filter((process) => process.client_id === clientId);

  if (!client.data) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando ficha do cliente…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-6">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold">{client.data.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {client.data.document ? maskDocument(client.data.document) : "Sem documento"} · {client.data.email ?? "—"} · {client.data.phone ?? "—"}
            </p>
          </div>
          <StatusBadge label={CLIENT_STATUS[client.data.status].label} tone={CLIENT_STATUS[client.data.status].tone} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-display text-base font-semibold">Processos vinculados</h3>
          <ul className="mt-4 divide-y divide-border">
            {related.map((process) => (
              <li key={process.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{process.code} — {process.title}</p>
                  <p className="text-xs text-muted-foreground">Prazo: {formatDate(process.due_date)}</p>
                </div>
                <StatusBadge label={PROCESS_STAGE[process.stage].label} tone={PROCESS_STAGE[process.stage].tone} />
              </li>
            ))}
            {related.length === 0 && <li className="py-4 text-sm text-muted-foreground">Nenhum processo vinculado.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
