import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Search, SlidersHorizontal, UserPlus, Users } from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClientOwners, useClientsPage, type ClientFilters } from "@/hooks/use-operations";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLIENT_STATUS } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ActiveFilters } from "@/components/shared/active-filters";
import { clearRememberedFilters, useFilterMemory } from "@/hooks/use-filter-memory";
import { formatDate, initials, maskDocument, maskPhone } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — FLUXA" },
      {
        name: "description",
        content: "Carteira de clientes com busca, filtros e histórico de relacionamento.",
      },
      { property: "og:title", content: "Clientes — FLUXA" },
      {
        property: "og:description",
        content: "Carteira de clientes com busca, filtros e histórico de relacionamento.",
      },
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
  const restoringFilters = useRef(false);
  const filterMemoryScope = `clients:${organizationId ?? "none"}`;

  const rememberedFilters = useMemo(
    () => ({ term, status, personType, owner, sort, archived, page }),
    [term, status, personType, owner, sort, archived, page],
  );

  useFilterMemory(filterMemoryScope, rememberedFilters, (remembered) => {
    restoringFilters.current = true;
    if (typeof remembered.term === "string") setTerm(remembered.term);
    if (
      typeof remembered.status === "string" &&
      (remembered.status === "todos" || remembered.status in CLIENT_STATUS)
    )
      setStatus(remembered.status);
    if (["todos", "pf", "pj"].includes(String(remembered.personType)))
      setPersonType(String(remembered.personType));
    if (typeof remembered.owner === "string") setOwner(remembered.owner);
    if (["name", "recent", "created"].includes(String(remembered.sort)))
      setSort(remembered.sort as ClientFilters["sort"]);
    if (typeof remembered.archived === "boolean") setArchived(remembered.archived);
    if (typeof remembered.page === "number" && remembered.page >= 0) setPage(remembered.page);
  });

  useEffect(() => {
    const preservePage = restoringFilters.current;
    const timer = setTimeout(() => {
      setDebounced(term);
      if (!preservePage) setPage(0);
      restoringFilters.current = false;
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

  const filters = useMemo<ClientFilters>(
    () => ({
      term: debounced,
      status,
      personType,
      owner,
      sort,
      archived,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debounced, status, personType, owner, sort, archived, page],
  );

  const query = useClientsPage(organizationId, filters);
  const rows = query.data?.rows ?? [];
  const count = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activeFilterCount = [
    term.trim().length > 0,
    status !== "todos",
    personType !== "todos",
    owner !== "todos",
    archived,
  ].filter(Boolean).length;

  const clearFilters = () => {
    clearRememberedFilters(filterMemoryScope);
    setTerm("");
    setDebounced("");
    setStatus("todos");
    setPersonType("todos");
    setOwner("todos");
    setSort("name");
    setArchived(false);
    setPage(0);
  };

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-cyan-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20 ring-1 ring-white/10">
                <Users className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-cyan-300 uppercase">
                  Carteira de relacionamento
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                  Clientes
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Encontre contatos, acompanhe responsáveis e mantenha cada relacionamento organizado.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-medium text-white">
                {count} {count === 1 ? "cliente encontrado" : "clientes encontrados"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {activeFilterCount > 0
                  ? `${activeFilterCount} filtro(s) ativo(s)`
                  : "Visão completa"}
              </span>
            </div>
          </div>
          {permissions.canCreate && (
            <Button
              className="min-h-10 w-full rounded-xl bg-white text-slate-950 shadow-lg shadow-black/10 hover:bg-slate-100 sm:w-auto"
              asChild
            >
              <Link to="/clientes/novo">
                <UserPlus className="size-4" aria-hidden />
                Novo cliente
              </Link>
            </Button>
          )}
        </div>
      </header>

      <Card className="rounded-2xl border-border/70 bg-card shadow-soft">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
                <SlidersHorizontal className="size-4" aria-hidden />
              </span>
              Busca e filtros
            </div>
            <span className="text-xs text-muted-foreground">
              {activeFilterCount > 0 ? `${activeFilterCount} ativo(s)` : "Sem filtros"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                aria-label="Buscar clientes"
                placeholder="Nome, documento, e-mail ou telefone"
                className="h-10 w-full rounded-xl border-border/70 bg-muted/20 pl-9"
              />
            </div>
            <Select value={status} onValueChange={resetPage(setStatus)}>
              <SelectTrigger
                aria-label="Filtrar por status"
                className="h-10 w-full rounded-xl sm:w-44"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(CLIENT_STATUS).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={personType} onValueChange={resetPage(setPersonType)}>
              <SelectTrigger
                aria-label="Filtrar por tipo de pessoa"
                className="h-10 w-full rounded-xl sm:w-40"
              >
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">PF e PJ</SelectItem>
                <SelectItem value="pf">Pessoa física</SelectItem>
                <SelectItem value="pj">Pessoa jurídica</SelectItem>
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={resetPage(setOwner)}>
              <SelectTrigger
                aria-label="Filtrar por responsável"
                className="h-10 w-full rounded-xl sm:w-48"
              >
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os responsáveis</SelectItem>
                {(owners.data ?? []).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={resetPage((value: string) => setSort(value as ClientFilters["sort"]))}
            >
              <SelectTrigger aria-label="Ordenar lista" className="h-10 w-full rounded-xl sm:w-52">
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
              className="w-full rounded-xl sm:ml-auto sm:w-auto"
            >
              <Archive className="size-4" aria-hidden />
              {archived ? "Vendo arquivados" : "Ver arquivados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ActiveFilters count={activeFilterCount} onClear={clearFilters} />

      {query.isLoading ? (
        <LoadingState label="Carregando clientes" rows={5} />
      ) : query.isError ? (
        <ErrorState
          title="Não foi possível carregar os clientes"
          description="Verifique sua conexão e tente carregar a carteira novamente."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border/70 shadow-soft">
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
          <Card className="hidden overflow-hidden rounded-2xl border-border/70 shadow-soft md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader className="bg-muted/20">
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
                    <TableRow key={client.id} className="transition-colors hover:bg-muted/20">
                      <TableCell>
                        <Link
                          to="/clientes/$clientId"
                          params={{ clientId: client.id }}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <Avatar className="size-9 rounded-xl ring-1 ring-border/70">
                            <AvatarFallback className="rounded-xl bg-primary/8 text-xs font-semibold text-primary">
                              {initials(client.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {client.name}
                            </span>
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
              <Card key={client.id} className="rounded-2xl border-border/70 shadow-soft">
                <CardContent className="p-4.5">
                  <Link
                    to="/clientes/$clientId"
                    params={{ clientId: client.id }}
                    className="flex items-center gap-3"
                  >
                    <Avatar className="size-10 rounded-xl ring-1 ring-border/70">
                      <AvatarFallback className="rounded-xl bg-primary/8 text-xs font-semibold text-primary">
                        {initials(client.name)}
                      </AvatarFallback>
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-soft">
            <p className="helper-text">
              Página {page + 1} de {pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
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
