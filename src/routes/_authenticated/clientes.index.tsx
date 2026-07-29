import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { useClients } from "@/hooks/use-operations";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { maskDocument, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — FLUXA" },
      { name: "description", content: "Base de clientes com documentos, contatos e histórico." },
      { property: "og:title", content: "Clientes — FLUXA" },
      { property: "og:description", content: "Base de clientes com documentos, contatos e histórico." },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const { organizationId } = useWorkspace();
  const clients = useClients(organizationId);
  const [term, setTerm] = useState("");

  const rows = (clients.data ?? []).filter((client) =>
    client.name.toLowerCase().includes(term.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar cliente por nome"
          className="max-w-sm"
        />
        <Button asChild>
          <Link to="/clientes/novo">Novo cliente</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Cadastre o primeiro cliente da operação." />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((client) => (
                <li key={client.id}>
                  <Link
                    to="/clientes/$clientId"
                    params={{ clientId: client.id }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.document ? maskDocument(client.document) : "Sem documento"} · {client.city ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge kind="client" value={client.status} />
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(client.last_interaction_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
