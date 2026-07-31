import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, GripVertical } from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { useProcesses } from "@/hooks/use-operations";
import { moveDemoProcess } from "@/lib/demo-store";
import { KANBAN_STAGES, PRIORITY, PROCESS_STAGE, type PriorityLevel, type ProcessStage } from "@/lib/domain";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { notifyDemoAction, notifyDemoStageChange } from "@/components/shared/demo-notice";

import { daysUntil, formatDate } from "@/lib/format";

type Search = { etapa?: string; responsavel?: string };

export const Route = createFileRoute("/_authenticated/processos/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    etapa: typeof search.etapa === "string" ? search.etapa : undefined,
    responsavel: typeof search.responsavel === "string" ? search.responsavel : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Processos — FLUXA" },
      { name: "description", content: "Kanban operacional com etapas, prazos, prioridades e responsáveis." },
      { property: "og:title", content: "Processos — FLUXA" },
      { property: "og:description", content: "Kanban operacional com etapas, prazos, prioridades e responsáveis." },
    ],
  }),
  component: ProcessesPage,
});

function deadlineTone(due: string | null) {
  const days = daysUntil(due);
  if (days === null) return { tone: "neutral" as const, label: "Sem prazo" };
  if (days < 0) return { tone: "danger" as const, label: `Atrasado ${Math.abs(days)}d` };
  if (days === 0) return { tone: "warning" as const, label: "Vence hoje" };
  if (days <= 3) return { tone: "caution" as const, label: `Faltam ${days}d` };
  return { tone: "success" as const, label: `Faltam ${days}d` };
}

function ProcessesPage() {
  const { etapa } = Route.useSearch();
  const { organizationId } = useWorkspace();
  const processes = useProcesses(organizationId);
  const [term, setTerm] = useState("");
  const [owner, setOwner] = useState("todos");
  const [priority, setPriority] = useState<"todos" | PriorityLevel>("todos");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ProcessStage | null>(null);

  const all = processes.data ?? [];
  const owners = useMemo(
    () => Array.from(new Set(all.map((process) => process.owner_name).filter(Boolean) as string[])).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return all.filter((process) => {
      const matchTerm =
        needle.length === 0 ||
        process.code.toLowerCase().includes(needle) ||
        (process.title ?? "").toLowerCase().includes(needle) ||
        (process.protocol ?? "").toLowerCase().includes(needle) ||
        (process.clients?.name ?? "").toLowerCase().includes(needle);
      const matchOwner = owner === "todos" || process.owner_name === owner;
      const matchPriority = priority === "todos" || process.priority === priority;
      const matchStage = !etapa || process.stage === etapa;
      return matchTerm && matchOwner && matchPriority && matchStage;
    });
  }, [all, term, owner, priority, etapa]);

  const drop = (stage: ProcessStage) => {
    setDropTarget(null);
    if (!dragging) return;
    const process = all.find((item) => item.id === dragging);
    setDragging(null);
    if (!process || process.stage === stage) return;
    moveDemoProcess(process.id, stage);
    notifyDemoStageChange(`${process.code} movido para ${PROCESS_STAGE[stage].label}.`);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Processos</h1>
        <p className="page-subtitle">
          Kanban operacional com etapas, prazos, prioridades e responsáveis.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Buscar processos"
          placeholder="Buscar por código, cliente ou protocolo"
          className="h-10 w-full sm:max-w-xs"
        />
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger aria-label="Filtrar por responsável" className="h-10 w-full sm:w-52">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {owners.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
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
        {etapa && (
          <Button variant="ghost" asChild>
            <Link to="/processos" search={{}}>Limpar filtro de etapa</Link>
          </Button>
        )}
        <Button className="sm:ml-auto" onClick={() => notifyDemoAction("Criação de processo")}>
          Novo processo
        </Button>
      </div>

      <p className="helper-text">
        Arraste os cards entre as colunas — as movimentações valem apenas nesta sessão de demonstração.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {KANBAN_STAGES.map((stage) => {
          const items = rows.filter((process) => process.stage === stage);
          const atRisk = items.filter((process) => {
            const days = daysUntil(process.due_date);
            return days !== null && days <= 0;
          }).length;
          return (
            <section
              key={stage}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(stage);
              }}
              onDragLeave={() => setDropTarget((current) => (current === stage ? null : current))}
              onDrop={() => drop(stage)}
              className={`min-w-0 rounded-xl border bg-card transition ${
                dropTarget === stage
                  ? "border-brand bg-brand/5"
                  : atRisk > 0
                    ? "border-destructive/35"
                    : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
                <p className="card-title truncate">{PROCESS_STAGE[stage].label}</p>
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
                  const deadline = deadlineTone(process.due_date);
                  const docsPct = process.documents_total
                    ? Math.round((process.documents_received / process.documents_total) * 100)
                    : 0;
                  return (
                    <li
                      key={process.id}
                      draggable
                      onDragStart={() => setDragging(process.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`rounded-lg border border-border bg-background p-3.5 transition ${
                        dragging === process.id ? "opacity-50" : "hover:border-brand/40 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical
                          className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground"
                          aria-hidden
                        />
                        <Link
                          to="/processos/$processId"
                          params={{ processId: process.id }}
                          className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <p className="truncate text-sm font-semibold">{process.clients?.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {process.code} · {process.title}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <StatusBadge label={PRIORITY[process.priority].label} tone={PRIORITY[process.priority].tone} />
                            <StatusBadge label={deadline.label} tone={deadline.tone} />
                          </div>
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">Docs {process.documents_received}/{process.documents_total}</span>
                              <span className="shrink-0">{docsPct}%</span>
                            </div>
                            <Progress value={docsPct} className="h-1.5" />
                          </div>
                          <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{process.owner_name}</span>
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

      {rows.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" aria-hidden />
            Nenhum processo corresponde aos filtros aplicados.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

