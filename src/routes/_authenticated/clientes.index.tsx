import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutGrid, Rows3, Users } from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { useClients, useProcesses } from "@/hooks/use-operations";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLIENT_STATUS, type ClientStatus } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { notifyDemoAction } from "@/components/shared/demo-notice";
import { digits, formatDate, initials, maskDocument, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — FLUXA" },
      { name: "description", content: "Carteira de clientes com documentos, contatos, processos e histórico." },
      { property: "og:title", content: "Clientes — FLUXA" },
      { property: "og:description", content: "Carteira de clientes com documentos, contatos, processos e histórico." },
    ],
  }),
  component: ClientsPage,
});

type SortKey = "name" | "recent" | "processes";

function ClientsPage() {
  const { organizationId } = useWorkspace();
  const clients = useClients(organizationId);
  const processes = useProcesses(organizationId);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"todos" | ClientStatus>("todos");
  const [type, setType] = useState<"todos" | "pf" | "pj">("todos");
  const [sort, setSort] = useState<SortKey>("name");
  const [view, setView] = useState<"tabela" | "cards">("tabela");

  const openByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const process of processes.data ?? []) {
      if (["finalizado", "arquivado", "cancelado"].includes(process.stage)) continue;
      map.set(process.client_id, (map.get(process.client_id) ?? 0) + 1);
    }
    return map;
  }, [processes.data]);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const numeric = digits(term);
    const filtered = (clients.data ?? []).filter((client) => {
      const matchTerm =
        needle.length === 0 ||
        client.name.toLowerCase().includes(needle) ||
        (client.email ?? "").toLowerCase().includes(needle) ||
        (numeric.length >= 3 && (client.document_digits ?? "").includes(numeric)) ||
        (numeric.length >= 3 && digits(client.phone ?? "").includes(numeric));
      const matchStatus = status === "todos" || client.status === status;
      const matchType = type === "todos" || client.person_type === type;
      return matchTerm && matchStatus && matchType;
    });

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sort === "recent") return (b.last_interaction_at ?? "").localeCompare(a.last_interaction_at ?? "");
      return (openByClient.get(b.id) ?? 0) - (openByClient.get(a.id) ?? 0);
    });
  }, [clients.data, term, status, type, sort, openByClient]);

  const total = (clients.data ?? []).length;
  const kpis = [
    { label: "Clientes na carteira", value: total },
    { label: "Ativos", value: (clients.data ?? []).filter((c) => c.status === "ativo").length },
    { label: "Com pendência", value: (clients.data ?? []).filter((c) => c.status === "com_pendencia").length },
    { label: "Leads", value: (clients.data ?? []).filter((c) => c.status === "lead").length },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Clientes</h1>
        <p className="page-subtitle">Carteira de clientes com documentos, contatos, processos e histórico.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <p className="field-label">{kpi.label}</p>
              <p className="metric-value mt-2 text-2xl">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Buscar clientes"
          placeholder="Buscar por nome, documento, e-mail ou telefone"
          className="h-10 w-full sm:max-w-xs"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger aria-label="Filtrar por status" className="h-10 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(CLIENT_STATUS).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
          <SelectTrigger aria-label="Filtrar por tipo" className="h-10 w-full sm:w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">PF e PJ</SelectItem>
            <SelectItem value="pf">Pessoa física</SelectItem>
            <SelectItem value="pj">Pessoa jurídica</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger aria-label="Ordenar lista" className="h-10 w-full sm:w-52"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nome (A–Z)</SelectItem>
            <SelectItem value="recent">Interação mais recente</SelectItem>
            <SelectItem value="processes">Mais processos abertos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-10 md:inline-flex"
            aria-label={view === "tabela" ? "Ver em cards" : "Ver em tabela"}
            title={view === "tabela" ? "Ver em cards" : "Ver em tabela"}
            onClick={() => setView(view === "tabela" ? "cards" : "tabela")}
          >
            {view === "tabela" ? <LayoutGrid className="size-4" /> : <Rows3 className="size-4" />}
          </Button>
          <Button variant="outline" onClick={() => notifyDemoAction("Exportação de carteira")}>
            Exportar
          </Button>
          <Button asChild>
            <Link to="/clientes/novo">Novo cliente</Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="Nenhum cliente encontrado"
              description="Ajuste os filtros ou cadastre um novo cliente na carteira."
            />
          </CardContent>
        </Card>
      ) : view === "tabela" ? (
        <>
        <Card className="hidden md:block">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Documento</TableHead>
                  <TableHead className="hidden lg:table-cell">Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Processos</TableHead>
                  <TableHead className="hidden 2xl:table-cell">Última interação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((client) => (
                  <TableRow key={client.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/clientes/$clientId"
                        params={{ clientId: client.id }}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <Avatar className="size-8">
                          <AvatarFallback className="text-[11px]">{initials(client.name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{client.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {client.person_type === "pj" ? "Pessoa jurídica" : "Pessoa física"} · {client.city ?? "—"}/{client.state ?? "—"}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {client.document ? maskDocument(client.document) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      <span className="block truncate">{client.email ?? "—"}</span>
                      <span className="block truncate text-xs">{client.phone ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={CLIENT_STATUS[client.status].label} tone={CLIENT_STATUS[client.status].tone} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{openByClient.get(client.id) ?? 0}</TableCell>
                    <TableCell className="hidden 2xl:table-cell text-xs text-muted-foreground">
                      {relativeTime(client.last_interaction_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="grid gap-3 md:hidden">
          {rows.map((client) => (
            <Link key={client.id} to="/clientes/$clientId" params={{ clientId: client.id }}>
              <Card className="transition hover:border-brand/40">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-10 shrink-0">
                        <AvatarFallback className="text-xs">{initials(client.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{client.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {client.document ? maskDocument(client.document) : "Sem documento"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge label={CLIENT_STATUS[client.status].label} tone={CLIENT_STATUS[client.status].tone} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="field-label">Processos</dt>
                      <dd className="mt-0.5 text-sm font-medium">{openByClient.get(client.id) ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="field-label">Última interação</dt>
                      <dd className="mt-0.5 text-sm font-medium">{relativeTime(client.last_interaction_at)}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((client) => (
            <Link key={client.id} to="/clientes/$clientId" params={{ clientId: client.id }}>
              <Card className="h-full transition hover:border-brand/40 hover:shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="text-xs">{initials(client.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{client.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {client.document ? maskDocument(client.document) : "Sem documento"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge label={CLIENT_STATUS[client.status].label} tone={CLIENT_STATUS[client.status].tone} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="field-label">Processos abertos</dt>
                      <dd className="mt-0.5 text-sm font-medium">{openByClient.get(client.id) ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="field-label">Última interação</dt>
                      <dd className="mt-0.5 text-sm font-medium">{formatDate(client.last_interaction_at)}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
