import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClientOwners, useClientsPage, type ClientFilters } from "@/hooks/use-operations";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CLIENT_STATUS } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, initials, maskDocument, maskPhone } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — FLUXA" },
      { name: "description", content: "Carteira de clientes com busca, filtros e histórico de relacionamento." },
      { property: "og:title", content: "Clientes — FLUXA" },
      { property: "og:description", content: "Carteira de clientes com busca, filtros e histórico de relacionamento." },
    ],
  }),
  component: ClientsPage,
});

const PAGE_SIZE = 20;

function ClientsPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const owners = useClientOwners(organizationId);

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("todos");
  const [personType, setPersonType] = useState("todos");
  const [owner, setOwner] = useState("todos");
  const [sort, setSort] = useState<ClientFilters["sort"]>("name");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(term);
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

  const filters = useMemo<ClientFilters>(
    () => ({ term: debounced, status, personType, owner, sort, archived, page, pageSize: PAGE_SIZE }),
    [debounced, status, personType, owner, sort, archived, page],
  );

  const query = useClientsPage(organizationId, filters);
  const rows = query.data?.rows ?? [];
  const count = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">
            {count} {count === 1 ? "cliente encontrado" : "clientes encontrados"} com os filtros atuais.
          </p>
        </div>
        {permissions.canCreate && (
          <Button asChild>
            <Link to="/clientes/novo">Novo cliente</Link>
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Buscar clientes"
          placeholder="Buscar por nome, documento, e-mail ou telefone"
          className="h-10 w-full sm:max-w-xs"
        />
        <Select value={status} onValueChange={resetPage(setStatus)}>
          <SelectTrigger aria-label="Filtrar por status" className="h-10 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(CLIENT_STATUS).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={personType} onValueChange={resetPage(setPersonType)}>
          <SelectTrigger aria-label="Filtrar por tipo de pessoa" className="h-10 w-full sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">PF e PJ</SelectItem>
            <SelectItem value="pf">Pessoa física</SelectItem>
            <SelectItem value="pj">Pessoa jurídica</SelectItem>
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={resetPage(setOwner)}>
          <SelectTrigger aria-label="Filtrar por responsável" className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {(owners.data ?? []).map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={resetPage((value: string) => setSort(value as ClientFilters["sort"]))}>
          <SelectTrigger aria-label="Ordenar lista" className="h-10 w-full sm:w-52">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nome (A–Z)</SelectItem>
            <SelectItem value="recent">Interação mais recente</SelectItem>
            <SelectItem value="created">Cadastro mais recente</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={archived ? "default" : "outline"}
          onClick={() => {
            setArchived(!archived);
            setPage(0);
          }}
          className="sm:ml-auto"
        >
          {archived ? "Vendo arquivados" : "Ver arquivados"}
        </Button>
      </div>

      {query.isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="Nenhum cliente encontrado"
              description="Ajuste os filtros ou cadastre um novo cliente na carteira."
            />
          </CardContent>
        </Card>
      ) : (
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
                    <TableHead className="hidden xl:table-cell">Responsável</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Última interação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          to="/clientes/$clientId"
                          params={{ clientId: client.id }}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">{initials(client.name)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{client.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {client.person_type === "pj" ? "Pessoa jurídica" : "Pessoa física"} ·{" "}
                              {client.city ?? "—"}/{client.state ?? "—"}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {client.document ? maskDocument(client.document) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        <span className="block truncate">{client.email ?? "—"}</span>
                        <span className="block truncate text-xs">
                          {client.phone ? maskPhone(client.phone) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={CLIENT_STATUS[client.status].label}
                          tone={CLIENT_STATUS[client.status].tone}
                        />
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                        {client.owner_name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                        {formatDate(client.last_interaction_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:hidden">
            {rows.map((client) => (
              <Card key={client.id}>
                <CardContent className="p-4">
                  <Link to="/clientes/$clientId" params={{ clientId: client.id }} className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">{initials(client.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.document ? maskDocument(client.document) : "Sem documento"}
                      </p>
                    </div>
                    <StatusBadge
                      label={CLIENT_STATUS[client.status].label}
                      tone={CLIENT_STATUS[client.status].tone}
                    />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="helper-text">
              Página {page + 1} de {pages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
