import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BriefcaseBusiness,
  GripVertical,
  LayoutGrid,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import {
  useClients,
  useProcesses,
  useProcessesPage,
  type ProcessFilters,
} from "@/hooks/use-operations";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ActiveFilters } from "@/components/shared/active-filters";
import { clearRememberedFilters, useFilterMemory } from "@/hooks/use-filter-memory";
import { daysUntil, formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      {
        name: "description",
        content: "Kanban e lista de processos com etapas, prazos, prioridades e responsáveis.",
      },
      { property: "og:title", content: "Processos — FLUXA" },
      {
        property: "og:description",
        content: "Kanban e lista de processos com etapas, prazos, prioridades e responsáveis.",
      },
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
  const restoringFilters = useRef(false);
  const filterMemoryScope = `processes:${organizationId ?? "none"}`;

  const rememberedFilters = useMemo(
    () => ({
      view,
      term,
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
    }),
    [
      view,
      term,
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
    ],
  );

  useFilterMemory(filterMemoryScope, rememberedFilters, (remembered) => {
    restoringFilters.current = true;
    if (["kanban", "tabela"].includes(String(remembered.view)))
      setView(remembered.view as "kanban" | "tabela");
    if (typeof remembered.term === "string") setTerm(remembered.term);
    if (!search.cliente && typeof remembered.clientId === "string")
      setClientId(remembered.clientId);
    if (typeof remembered.serviceTypeId === "string") setServiceTypeId(remembered.serviceTypeId);
    if (
      !search.etapa &&
      typeof remembered.stage === "string" &&
      (remembered.stage === "todos" || remembered.stage in PROCESS_STAGE)
    )
      setStage(remembered.stage);
    if (
      typeof remembered.priority === "string" &&
      (remembered.priority === "todos" || remembered.priority in PRIORITY)
    )
      setPriority(remembered.priority);
    if (!search.responsavel && typeof remembered.owner === "string") setOwner(remembered.owner);
    if (
      typeof remembered.financial === "string" &&
      (remembered.financial === "todos" || remembered.financial in FINANCIAL_STATUS)
    )
      setFinancial(remembered.financial);
    if (["todos", "atrasados", "hoje", "semana", "sem_prazo"].includes(String(remembered.deadline)))
      setDeadline(remembered.deadline as ProcessFilters["deadline"]);
    if (typeof remembered.archived === "boolean") setArchived(remembered.archived);
    if (["due", "recent", "code"].includes(String(remembered.sort)))
      setSort(remembered.sort as ProcessFilters["sort"]);
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
    [
      debounced,
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
    ],
  );

  const list = useProcessesPage(organizationId, filters);
  const rows = list.data?.rows ?? [];
  const count = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activeFilterCount = [
    term.trim().length > 0,
    clientId !== "todos",
    serviceTypeId !== "todos",
    stage !== "todos",
    priority !== "todos",
    owner !== "todos",
    financial !== "todos",
    deadline !== "todos",
    archived,
  ].filter(Boolean).length;

  const clearFilters = () => {
    clearRememberedFilters(filterMemoryScope);
    setTerm("");
    setDebounced("");
    setClientId("todos");
    setServiceTypeId("todos");
    setStage("todos");
    setPriority("todos");
    setOwner("todos");
    setFinancial("todos");
    setDeadline("todos");
    setArchived(false);
    setPage(0);
  };

  const all = board.data ?? [];
  const owners = useMemo(
    () =>
      Array.from(
        new Set(all.map((process) => process.owner_name).filter(Boolean) as string[]),
      ).sort(),
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
  const atRiskCount = cards.filter((process) => {
    const days = daysUntil(process.due_date);
    return days !== null && days <= 0;
  }).length;
  const unassignedCount = cards.filter((process) => !process.owner_name).length;
  const visibleCount = view === "kanban" ? cards.length : count;

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
      await moveStage.mutateAsync({
        processId: process.id,
        from: process.stage,
        to: target,
        code: process.code,
      });
      toast.success(`${process.code} movido para ${PROCESS_STAGE[target].label}.`);
    } catch (error) {
      toast.error(describeError(error, "etapa"));
    }
  };

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-violet-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-violet-400 text-slate-950 shadow-lg shadow-violet-400/20 ring-1 ring-white/10">
                <BriefcaseBusiness className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-violet-300 uppercase">
                  Fluxo operacional
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                  Processos
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Acompanhe etapas, prazos, prioridades e responsáveis em um único painel.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-medium text-white">
                {visibleCount} {visibleCount === 1 ? "processo visível" : "processos visíveis"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {atRiskCount} em risco
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {unassignedCount} sem responsável
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="grid w-full min-w-0 grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] p-1 sm:w-60 sm:shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "min-w-0 whitespace-nowrap rounded-lg px-3 text-slate-300 hover:bg-white/10 hover:text-white",
                  view === "kanban" &&
                    "bg-white text-slate-950 shadow-sm hover:bg-white hover:text-slate-950",
                )}
                onClick={() => setView("kanban")}
              >
                <LayoutGrid className="size-4" aria-hidden />
                Quadro
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "min-w-0 whitespace-nowrap rounded-lg px-3 text-slate-300 hover:bg-white/10 hover:text-white",
                  view === "tabela" &&
                    "bg-white text-slate-950 shadow-sm hover:bg-white hover:text-slate-950",
                )}
                onClick={() => setView("tabela")}
              >
                <Rows3 className="size-4" aria-hidden />
                Lista
              </Button>
            </div>
            {permissions.canCreate && (
              <Button
                className="min-h-10 flex-1 rounded-xl bg-white text-slate-950 shadow-lg shadow-black/10 hover:bg-slate-100 sm:flex-none"
                onClick={() => navigate({ to: "/processos/novo" })}
              >
                <Plus className="size-4" aria-hidden />
                Novo processo
              </Button>
            )}
          </div>
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
                aria-label="Buscar processos"
                placeholder="Código, título, protocolo ou cliente"
                className="h-10 w-full rounded-xl border-border/70 bg-muted/20 pl-9"
              />
            </div>
            <Select value={clientId} onValueChange={resetPage(setClientId)}>
              <SelectTrigger
                aria-label="Filtrar por cliente"
                className="h-10 w-full rounded-xl sm:w-52"
              >
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clientes</SelectItem>
                {(clients.data ?? []).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceTypeId} onValueChange={resetPage(setServiceTypeId)}>
              <SelectTrigger
                aria-label="Filtrar por tipo de serviço"
                className="h-10 w-full rounded-xl sm:w-48"
              >
                <SelectValue placeholder="Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os serviços</SelectItem>
                {(serviceTypes.data ?? []).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={resetPage(setStage)}>
              <SelectTrigger
                aria-label="Filtrar por etapa"
                className="h-10 w-full rounded-xl sm:w-52"
              >
                <SelectValue placeholder="Etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as etapas</SelectItem>
                {Object.entries(PROCESS_STAGE).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={resetPage(setPriority)}>
              <SelectTrigger
                aria-label="Filtrar por prioridade"
                className="h-10 w-full rounded-xl sm:w-44"
              >
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas prioridades</SelectItem>
                {Object.entries(PRIORITY).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
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
                {owners.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={financial} onValueChange={resetPage(setFinancial)}>
              <SelectTrigger
                aria-label="Filtrar por situação financeira"
                className="h-10 w-full rounded-xl sm:w-48"
              >
                <SelectValue placeholder="Financeiro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo o financeiro</SelectItem>
                {Object.entries(FINANCIAL_STATUS).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={deadline}
              onValueChange={resetPage((value: string) =>
                setDeadline(value as ProcessFilters["deadline"]),
              )}
            >
              <SelectTrigger
                aria-label="Filtrar por prazo"
                className="h-10 w-full rounded-xl sm:w-44"
              >
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
              <Select
                value={sort}
                onValueChange={resetPage((value: string) =>
                  setSort(value as ProcessFilters["sort"]),
                )}
              >
                <SelectTrigger
                  aria-label="Ordenar processos"
                  className="h-10 w-full rounded-xl sm:w-52"
                >
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
              className="w-full rounded-xl sm:ml-auto sm:w-auto"
            >
              {archived ? "Vendo arquivados" : "Ver arquivados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ActiveFilters count={activeFilterCount} onClear={clearFilters} />

      {view === "kanban" ? (
        board.isLoading ? (
          <LoadingState label="Carregando quadro de processos" rows={5} />
        ) : board.isError ? (
          <ErrorState
            title="Não foi possível carregar o quadro de processos"
            description="Tente novamente para recuperar as etapas e os processos do quadro."
            onRetry={() => void board.refetch()}
            retrying={board.isFetching}
          />
        ) : (
          <>
            <p className="rounded-xl border border-border/60 bg-card px-4 py-3 text-xs text-muted-foreground shadow-soft">
              Arraste os cards entre as colunas — cada movimentação é registrada na linha do tempo
              do processo.
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
                    onDragLeave={() =>
                      setDropTarget((current) => (current === column ? null : current))
                    }
                    onDrop={() => void drop(column)}
                    className={`min-w-0 overflow-hidden rounded-2xl border bg-card shadow-soft transition-all ${
                      dropTarget === column
                        ? "border-brand bg-brand/5 shadow-panel"
                        : atRisk > 0
                          ? "border-destructive/35"
                          : "border-border/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/10 px-4 py-3.5">
                      <p className="truncate font-display text-sm font-semibold tracking-tight">
                        {PROCESS_STAGE[column].label}
                      </p>
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
                            className={`rounded-xl border border-border/70 bg-background p-3.5 shadow-sm transition-all ${
                              dragging === process.id
                                ? "opacity-50"
                                : "hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-panel"
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
                                <p className="truncate text-sm font-semibold">
                                  {process.clients?.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {process.code} ·{" "}
                                  {process.title ?? process.service_types?.name ?? "Processo"}
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
                                  <span className="shrink-0">
                                    Prazo {formatDate(process.due_date)}
                                  </span>
                                </div>
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                      {items.length === 0 && (
                        <li className="rounded-xl border border-dashed border-border bg-muted/10 py-7 text-center text-xs text-muted-foreground">
                          Nenhum processo nesta etapa.
                        </li>
                      )}
                    </ul>
                  </section>
                );
              })}
            </div>

            {cards.length === 0 && !board.isLoading && (
              <Card className="rounded-2xl border-border/70 shadow-soft">
                <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                  <AlertTriangle className="size-4" aria-hidden />
                  Nenhum processo corresponde aos filtros aplicados.
                </CardContent>
              </Card>
            )}
          </>
        )
      ) : list.isLoading ? (
        <LoadingState label="Carregando lista de processos" rows={5} />
      ) : list.isError ? (
        <ErrorState
          title="Não foi possível carregar a lista de processos"
          description="Tente novamente para recuperar os processos com os filtros atuais."
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden rounded-2xl border-border/70 shadow-soft md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader className="bg-muted/20">
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
                    <TableRow key={process.id} className="transition-colors hover:bg-muted/20">
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
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Nenhum processo corresponde aos filtros aplicados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:hidden">
            {rows.map((process) => (
              <Card key={process.id} className="rounded-2xl border-border/70 shadow-soft">
                <CardContent className="p-4.5">
                  <Link
                    to="/processos/$processId"
                    params={{ processId: process.id }}
                    className="block min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{process.code}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {process.clients?.name ?? "Cliente não informado"}
                        </span>
                      </span>
                      <StatusBadge
                        label={PROCESS_STAGE[process.stage].label}
                        tone={PROCESS_STAGE[process.stage].tone}
                      />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm">
                      {process.title ?? process.service_types?.name ?? "Processo"}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Responsável</dt>
                        <dd className="truncate font-medium">{process.owner_name ?? "—"}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-muted-foreground">Prazo</dt>
                        <dd className="font-medium">{formatDate(process.due_date)}</dd>
                      </div>
                    </dl>
                  </Link>
                </CardContent>
              </Card>
            ))}
            {rows.length === 0 && (
              <Card className="rounded-2xl border-border/70 shadow-soft">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum processo corresponde aos filtros aplicados.
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-soft">
            <p className="helper-text">
              {count} {count === 1 ? "processo" : "processos"} · página {page + 1} de {pages}
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
