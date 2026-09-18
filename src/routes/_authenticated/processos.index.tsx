import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, GripVertical, LayoutGrid, Rows3 } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients, useProcesses, useProcessesPage, type ProcessFilters } from "@/hooks/use-operations";
import { useMoveProcessStage, useServiceTypes } from "@/hooks/use-mutations";
import { describeError } from "@/lib/errors";
import {
  FINANCIAL_STATUS,
  KANBAN_STAGES,
  PRIORITY,
  PROCESS_STAGE,
  type ProcessStage,
} from "@/lib/domain";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { daysUntil, formatCurrency, formatDate } from "@/lib/format";

type Search = { etapa?: string; responsavel?: string; cliente?: string };

export const Route = createFileRoute("/_authenticated/processos/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    etapa: typeof search.etapa === "string" ? search.etapa : undefined,
    responsavel: typeof search.responsavel === "string" ? search.responsavel : undefined,
    cliente: typeof search.cliente === "string" ? search.cliente : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Processos — FLUXA" },
      { name: "description", content: "Kanban e lista de processos com etapas, prazos, prioridades e responsáveis." },
      { property: "og:title", content: "Processos — FLUXA" },
      { property: "og:description", content: "Kanban e lista de processos com etapas, prazos, prioridades e responsáveis." },
    ],
  }),
  component: ProcessesPage,
});

const PAGE_SIZE = 25;

function deadlineTone(due: string | null) {
  const days = daysUntil(due);
  if (days === null) return { tone: "neutral" as const, label: "Sem prazo" };
  if (days < 0) return { tone: "danger" as const, label: `Atrasado ${Math.abs(days)}d` };
  if (days === 0) return { tone: "warning" as const, label: "Vence hoje" };
  if (days <= 3) return { tone: "caution" as const, label: `Faltam ${days}d` };
  return { tone: "success" as const, label: `Faltam ${days}d` };
}

function ProcessesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();

  const clients = useClients(organizationId);
  const serviceTypes = useServiceTypes(organizationId);
  const board = useProcesses(organizationId);
  const moveStage = useMoveProcessStage(organizationId);

  const [view, setView] = useState<"kanban" | "tabela">("kanban");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [clientId, setClientId] = useState(search.cliente ?? "todos");
  const [serviceTypeId, setServiceTypeId] = useState("todos");
  const [stage, setStage] = useState(search.etapa ?? "todos");
  const [priority, setPriority] = useState("todos");
  const [owner, setOwner] = useState(search.responsavel ?? "todos");
  const [financial, setFinancial] = useState("todos");
  const [deadline, setDeadline] = useState<ProcessFilters["deadline"]>("todos");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<ProcessFilters["sort"]>("due");
  const [page, setPage] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ProcessStage | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(term);
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

  const filters = useMemo<ProcessFilters>(
    () => ({
      term: debounced,
      clientId,
      serviceTypeId,
      stage,
      priority,
      owner,
      financial,
      deadline,
      archived,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debounced, clientId, serviceTypeId, stage, priority, owner, financial, deadline, archived, sort, page],
  );

  const list = useProcessesPage(organizationId, filters);
  const rows = list.data?.rows ?? [];
  const count = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const all = board.data ?? [];
  const owners = useMemo(
    () => Array.from(new Set(all.map((process) => process.owner_name).filter(Boolean) as string[])).sort(),
    [all],
  );

  const cards = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return all.filter((process) => {
      const matchTerm =
        needle.length === 0 ||
        process.code.toLowerCase().includes(needle) ||
        (process.title ?? "").toLowerCase().includes(needle) ||
        (process.protocol ?? "").toLowerCase().includes(needle) ||
        (process.clients?.name ?? "").toLowerCase().includes(needle);
      const matchDeadline =
        deadline === "todos" ||
        (deadline === "atrasados" && process.due_date !== null && process.due_date < today) ||
        (deadline === "hoje" && process.due_date === today) ||
        (deadline === "semana" &&
          process.due_date !== null &&
          process.due_date >= today &&
          process.due_date <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)) ||
        (deadline === "sem_prazo" && process.due_date === null);
      return (
        matchTerm &&
        matchDeadline &&
        (clientId === "todos" || process.client_id === clientId) &&
        (serviceTypeId === "todos" || process.service_type_id === serviceTypeId) &&
        (priority === "todos" || process.priority === priority) &&
        (owner === "todos" || process.owner_name === owner) &&
        (financial === "todos" || process.financial_status === financial) &&
        (stage === "todos" || process.stage === stage)
      );
    });
  }, [all, debounced, clientId, serviceTypeId, priority, owner, financial, deadline, stage]);

  const drop = async (target: ProcessStage) => {
    setDropTarget(null);
    const id = dragging;
    setDragging(null);
    if (!id) return;
    if (!permissions.canMoveStage) {
      toast.error("Seu perfil não pode movimentar processos.");
      return;
    }
    const process = all.find((item) => item.id === id);
    if (!process || process.stage === target) return;
    try {
      await moveStage.mutateAsync({ processId: process.id, from: process.stage, to: target, code: process.code });
      toast.success(`${process.code} movido para ${PROCESS_STAGE[target].label}.`);
    } catch (error) {
      toast.error(describeError(error, "etapa"));
    }
  };

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title">Processos</h1>
          <p className="page-subtitle">Etapas, prazos, prioridades e responsáveis em um único painel.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={view === "kanban" ? "Ver em lista" : "Ver em kanban"}
            title={view === "kanban" ? "Ver em lista" : "Ver em kanban"}
            onClick={() => setView(view === "kanban" ? "tabela" : "kanban")}
          >
            {view === "kanban" ? <Rows3 className="size-4" /> : <LayoutGrid className="size-4" />}
          </Button>
          {permissions.canCreate && (
            <Button onClick={() => navigate({ to: "/processos/novo" })}>Novo processo</Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Buscar processos"
          placeholder="Buscar por código, título ou protocolo"
          className="h-10 w-full sm:max-w-xs"
        />
        <Select value={clientId} onValueChange={resetPage(setClientId)}>
          <SelectTrigger aria-label="Filtrar por cliente" className="h-10 w-full sm:w-52">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {(clients.data ?? []).map((client) => (
              <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={serviceTypeId} onValueChange={resetPage(setServiceTypeId)}>
          <SelectTrigger aria-label="Filtrar por tipo de serviço" className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os serviços</SelectItem>
            {(serviceTypes.data ?? []).map((type) => (
              <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stage} onValueChange={resetPage(setStage)}>
          <SelectTrigger aria-label="Filtrar por etapa" className="h-10 w-full sm:w-52">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as etapas</SelectItem>
            {Object.entries(PROCESS_STAGE).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={resetPage(setPriority)}>
          <SelectTrigger aria-label="Filtrar por prioridade" className="h-10 w-full sm:w-44">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas prioridades</SelectItem>
            {Object.entries(PRIORITY).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={resetPage(setOwner)}>
          <SelectTrigger aria-label="Filtrar por responsável" className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {owners.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={financial} onValueChange={resetPage(setFinancial)}>
          <SelectTrigger aria-label="Filtrar por situação financeira" className="h-10 w-full sm:w-48">
            <SelectValue placeholder="Financeiro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo o financeiro</SelectItem>
            {Object.entries(FINANCIAL_STATUS).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deadline} onValueChange={resetPage((value: string) => setDeadline(value as ProcessFilters["deadline"]))}>
          <SelectTrigger aria-label="Filtrar por prazo" className="h-10 w-full sm:w-44">
            <SelectValue placeholder="Prazo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Qualquer prazo</SelectItem>
            <SelectItem value="atrasados">Atrasados</SelectItem>
            <SelectItem value="hoje">Vencem hoje</SelectItem>
            <SelectItem value="semana">Próximos 7 dias</SelectItem>
            <SelectItem value="sem_prazo">Sem prazo</SelectItem>
          </SelectContent>
        </Select>
        {view === "tabela" && (
          <Select value={sort} onValueChange={resetPage((value: string) => setSort(value as ProcessFilters["sort"]))}>
            <SelectTrigger aria-label="Ordenar processos" className="h-10 w-full sm:w-52">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Prazo mais próximo</SelectItem>
              <SelectItem value="recent">Movimentação recente</SelectItem>
              <SelectItem value="code">Código (recentes)</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          variant={archived ? "default" : "outline"}
          onClick={() => {
            setArchived(!archived);
            setPage(0);
            setView("tabela");
          }}
          className="sm:ml-auto"
        >
          {archived ? "Vendo arquivados" : "Ver arquivados"}
        </Button>
      </div>

      {view === "kanban" ? (
        <>
          <p className="helper-text">
            Arraste os cards entre as colunas — cada movimentação é registrada na linha do tempo do processo.
          </p>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {KANBAN_STAGES.map((column) => {
              const items = cards.filter((process) => process.stage === column);
              const atRisk = items.filter((process) => {
                const days = daysUntil(process.due_date);
                return days !== null && days <= 0;
              }).length;
              return (
                <section
                  key={column}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTarget(column);
                  }}
                  onDragLeave={() => setDropTarget((current) => (current === column ? null : current))}
                  onDrop={() => void drop(column)}
                  className={`min-w-0 rounded-xl border bg-card transition ${
                    dropTarget === column
                      ? "border-brand bg-brand/5"
                      : atRisk > 0
                        ? "border-destructive/35"
                        : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
                    <p className="card-title truncate">{PROCESS_STAGE[column].label}</p>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {atRisk > 0 && (
                        <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-medium text-destructive">
                          {atRisk} em risco
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {items.length}
                      </span>
                    </span>
                  </div>
                  <ul className="space-y-2.5 p-3">
                    {items.map((process) => {
                      const due = deadlineTone(process.due_date);
                      const docsPct = process.documents_total
                        ? Math.round((process.documents_received / process.documents_total) * 100)
                        : 0;
                      return (
                        <li
                          key={process.id}
                          draggable={permissions.canMoveStage}
                          onDragStart={() => setDragging(process.id)}
                          onDragEnd={() => setDragging(null)}
                          className={`rounded-lg border border-border bg-background p-3.5 transition ${
                            dragging === process.id ? "opacity-50" : "hover:border-brand/40 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {permissions.canMoveStage && (
                              <GripVertical
                                className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground"
                                aria-hidden
                              />
                            )}
                            <Link
                              to="/processos/$processId"
                              params={{ processId: process.id }}
                              className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <p className="truncate text-sm font-semibold">{process.clients?.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {process.code} · {process.title ?? process.service_types?.name ?? "Processo"}
                              </p>
                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                <StatusBadge
                                  label={PRIORITY[process.priority].label}
                                  tone={PRIORITY[process.priority].tone}
                                />
                                <StatusBadge label={due.label} tone={due.tone} />
                              </div>
                              <div className="mt-3 space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="truncate">
                                    Docs {process.documents_received}/{process.documents_total}
                                  </span>
                                  <span className="shrink-0">{docsPct}%</span>
                                </div>
                                <Progress value={docsPct} className="h-1.5" />
                              </div>
                              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="truncate">{process.owner_name ?? "—"}</span>
                                <span className="shrink-0">Prazo {formatDate(process.due_date)}</span>
                              </div>
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                    {items.length === 0 && (
                      <li className="rounded-lg border border-dashed border-border py-7 text-center text-xs text-muted-foreground">
                        Nenhum processo nesta etapa.
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>

          {cards.length === 0 && !board.isLoading && (
            <Card>
              <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <AlertTriangle className="size-4" aria-hidden />
                Nenhum processo corresponde aos filtros aplicados.
              </CardContent>
            </Card>
          )}
        </>
      ) : list.isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Processo</TableHead>
                    <TableHead className="hidden md:table-cell">Cliente</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="hidden lg:table-cell">Prioridade</TableHead>
                    <TableHead className="hidden xl:table-cell">Responsável</TableHead>
                    <TableHead className="hidden lg:table-cell">Prazo</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((process) => (
                    <TableRow key={process.id}>
                      <TableCell>
                        <Link
                          to="/processos/$processId"
                          params={{ processId: process.id }}
                          className="block min-w-0"
                        >
                          <span className="block truncate text-sm font-medium">{process.code}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {process.title ?? process.service_types?.name ?? "Processo"}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {process.clients?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={PROCESS_STAGE[process.stage].label}
                          tone={PROCESS_STAGE[process.stage].tone}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <StatusBadge
                          label={PRIORITY[process.priority].label}
                          tone={PRIORITY[process.priority].tone}
                        />
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                        {process.owner_name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {formatDate(process.due_date)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                        {formatCurrency(process.value ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        Nenhum processo corresponde aos filtros aplicados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="helper-text">
              {count} {count === 1 ? "processo" : "processos"} · página {page + 1} de {pages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
                Anterior
              </Button>
              <Button variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
