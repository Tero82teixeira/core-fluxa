import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { useOperationalMonitoring, useMonitoringActions } from "@/hooks/use-monitoring-center";
import { useOrganizationSettings } from "@/hooks/use-organization-settings";
import { useTeamMembers } from "@/hooks/use-team";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import {
  effectivePriority,
  filterMonitoringAlerts,
  sourcePath,
  type MonitoringAlert,
  type MonitoringPriority,
  type MonitoringStatus,
} from "@/lib/monitoring";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { describeError } from "@/lib/errors";
import { formatUpcomingDaysLabel } from "@/lib/organization-settings";

export const Route = createFileRoute("/_authenticated/monitoramento")({
  head: () => ({
    meta: [
      { title: "Central de Monitoramento — FLUXA" },
      {
        name: "description",
        content: "Alertas operacionais e acompanhamento humano da organização.",
      },
    ],
  }),
  component: Page,
});
const ALL = "todos";
const sourceLabel: Record<string, string> = {
  tarefa: "Tarefa",
  processo: "Processo",
  documento: "Documento",
  comunicacao: "Comunicação",
  financeiro: "Financeiro",
  outro: "Outro",
};
const statusLabel: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  acompanhado: "Acompanhado",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};
const priorityLabel: Record<string, string> = {
  baixa: "Baixo",
  media: "Médio",
  alta: "Alto",
  critica: "Crítico",
};
const priorityTone: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-blue-100 text-blue-800",
  alta: "bg-amber-100 text-amber-800",
  critica: "bg-red-100 text-red-800",
};
const monitoringAdmins = ["superadmin", "proprietario", "administrador", "gestor"];

function Page() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const canAdminMonitoring = Boolean(
    permissions.role && monitoringAdmins.includes(permissions.role),
  );
  const canFollowUp = canAdminMonitoring || permissions.role === "operacional";
  const query = useOperationalMonitoring(organizationId);
  const actions = useMonitoringActions(organizationId);
  const team = useTeamMembers(organizationId);
  const settings = useOrganizationSettings(organizationId);
  const [filter, setFilter] = useState({
    search: "",
    type: ALL,
    status: ALL,
    priority: ALL,
    window: ALL,
    responsibleId: ALL,
    clientId: ALL,
  });
  const [selected, setSelected] = useState<MonitoringAlert | null>(null);
  const clients = useMemo(
    () => [
      ...new Map(
        (query.data ?? [])
          .filter((x) => x.client_id && x.client_name)
          .map((x) => [x.client_id!, x.client_name!]),
      ).entries(),
    ],
    [query.data],
  );
  const rows = useMemo(
    () => filterMonitoringAlerts(query.data ?? [], filter),
    [query.data, filter],
  );
  const all = query.data ?? [];
  const totals = {
    critical: all.filter(
      (x) =>
        effectivePriority(x) === "critica" &&
        !["resolvido", "ignorado"].includes(x.monitoring_status),
    ).length,
    overdue: all.filter((x) => (x.days_delta ?? 0) < 0).length,
    today: all.filter((x) => x.days_delta === 0).length,
    next7: all.filter((x) => x.days_delta !== null && x.days_delta > 0 && x.days_delta <= 7).length,
    stale: all.filter((x) => x.alert_kind === "processo_sem_movimentacao").length,
    resolved: all.filter(
      (x) =>
        x.monitoring_status === "resolvido" &&
        x.state_updated_at &&
        Date.now() - new Date(x.state_updated_at).getTime() <= 7 * 864e5,
    ).length,
  };
  const metrics: Array<{
    label: string;
    value: number;
    key: keyof typeof filter;
    target: string;
    icon: LucideIcon;
    accent: string;
    iconTone: string;
  }> = [
    {
      label: "Críticos",
      value: totals.critical,
      key: "priority",
      target: "critica",
      icon: ShieldAlert,
      accent: "bg-rose-500",
      iconTone: "bg-rose-500/10 text-rose-600",
    },
    {
      label: "Atrasados",
      value: totals.overdue,
      key: "window",
      target: "vencidos",
      icon: CircleAlert,
      accent: "bg-orange-500",
      iconTone: "bg-orange-500/10 text-orange-600",
    },
    {
      label: "Vencem hoje",
      value: totals.today,
      key: "window",
      target: "hoje",
      icon: Clock3,
      accent: "bg-amber-500",
      iconTone: "bg-amber-500/10 text-amber-600",
    },
    {
      label: formatUpcomingDaysLabel(settings.data?.monitoring_upcoming_days),
      value: totals.next7,
      key: "window",
      target: "7",
      icon: TimerReset,
      accent: "bg-blue-500",
      iconTone: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Sem movimentação",
      value: totals.stale,
      key: "window",
      target: "sem_movimentacao",
      icon: Activity,
      accent: "bg-violet-500",
      iconTone: "bg-violet-500/10 text-violet-600",
    },
    {
      label: "Resolvidos recentemente",
      value: totals.resolved,
      key: "status",
      target: "resolvido",
      icon: CheckCircle2,
      accent: "bg-emerald-500",
      iconTone: "bg-emerald-500/10 text-emerald-600",
    },
  ];
  const pendingCount = all.filter(
    (item) => !["resolvido", "ignorado"].includes(item.monitoring_status),
  ).length;
  const set = (key: string, value: string) => setFilter((f) => ({ ...f, [key]: value }));
  const act = async (fn: () => Promise<void>, message: string) => {
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(describeError(e, "monitoramento"));
    }
  };
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-rose-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-rose-400 text-slate-950 shadow-lg shadow-rose-400/20 ring-1 ring-white/10">
              <ShieldAlert className="size-5.5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-rose-300 uppercase">
                Vigilância operacional
              </p>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                Monitoramento
              </h1>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Antecipe riscos, acompanhe ocorrências e transforme alertas em ações responsáveis.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-medium text-white">
              {pendingCount} exigindo atenção
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              {totals.critical} crítico(s)
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              {rows.length} visível(is)
            </span>
          </div>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const active = filter[metric.key] === metric.target;
          return (
            <button
              key={metric.label}
              onClick={() => set(metric.key, metric.target)}
              className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card
                className={`relative h-full overflow-hidden rounded-2xl border-border/70 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-panel ${active ? "border-primary/40 ring-2 ring-primary/10" : ""}`}
              >
                <span className={`absolute inset-x-0 top-0 h-1 ${metric.accent}`} aria-hidden />
                <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs leading-4 text-muted-foreground">{metric.label}</p>
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg ${metric.iconTone}`}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatNumber(metric.value)}
                  </p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
      <Card className="rounded-2xl border-border/70 bg-card shadow-soft">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
                <SlidersHorizontal className="size-4" aria-hidden />
              </span>
              Busca e filtros
            </div>
            <span className="text-xs text-muted-foreground">{rows.length} resultado(s)</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-xl border-border/70 bg-muted/20 pl-9"
                placeholder="Cliente, título, processo, descrição ou responsável"
                value={filter.search}
                onChange={(e) => set("search", e.target.value)}
              />
            </div>
            <Filter
              value={filter.type}
              set={(v) => set("type", v)}
              label="Tipo"
              values={Object.entries(sourceLabel)}
            />
            <Filter
              value={filter.clientId}
              set={(v) => set("clientId", v)}
              label="Cliente"
              values={clients}
            />
            <Filter
              value={filter.responsibleId}
              set={(v) => set("responsibleId", v)}
              label="Responsável"
              values={(team.data ?? []).map((m) => [m.user_id, m.full_name ?? m.email ?? "Membro"])}
            />
            <Filter
              value={filter.status}
              set={(v) => set("status", v)}
              label="Status"
              values={Object.entries(statusLabel)}
            />
            <Filter
              value={filter.priority}
              set={(v) => set("priority", v)}
              label="Prioridade"
              values={Object.entries(priorityLabel)}
            />
            <Filter
              value={filter.window}
              set={(v) => set("window", v)}
              label="Período"
              values={[
                ["vencidos", "Vencidos"],
                ["hoje", "Hoje"],
                ["7", "Próximos 7 dias"],
                ["30", "Próximos 30 dias"],
                ["sem_movimentacao", "Sem movimentação"],
              ]}
            />
          </div>
        </CardContent>
      </Card>
      {query.isLoading ? (
        <LoadingState label="Carregando alertas de monitoramento" rows={4} />
      ) : query.isError ? (
        <ErrorState
          title="Não foi possível carregar os alertas"
          description="Tente novamente para recuperar a central de monitoramento."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="flex flex-col items-center p-12 text-center">
            <CheckCircle2 className="mb-3 size-10 text-emerald-600" />
            <h2 className="font-semibold">Tudo em dia</h2>
            <p className="text-sm text-muted-foreground">
              Nenhum item exige atenção para os filtros selecionados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 border-b bg-muted/40 p-3 text-xs font-medium text-muted-foreground md:grid">
            <span>Alerta / origem</span>
            <span>Responsável</span>
            <span>Prazo</span>
            <span>Acompanhamento</span>
            <span>Ação</span>
          </div>
          {rows.map((a) => (
            <button
              key={`${a.source_type}:${a.source_id}:${a.alert_kind}`}
              onClick={() => setSelected(a)}
              className="grid w-full gap-3 border-b border-border/60 p-4 text-left transition-colors last:border-0 hover:bg-muted/30 sm:p-5 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <strong className="truncate text-sm">{a.title}</strong>
                  <Badge variant="outline">{sourceLabel[a.source_type]}</Badge>
                  <Badge className={priorityTone[effectivePriority(a)]}>
                    {priorityLabel[effectivePriority(a)]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.reason}
                  {a.client_name ? ` · ${a.client_name}` : ""}
                  {a.process_code ? ` · ${a.process_code}` : ""}
                </p>
              </div>
              <span className="text-sm text-muted-foreground md:text-foreground">
                {a.assigned_name ?? a.responsible_name ?? "Não atribuído"}
              </span>
              <span className="text-sm text-muted-foreground md:text-foreground">
                {formatDate(a.relevant_at)}
              </span>
              <Badge variant="secondary" className="w-fit">
                {statusLabel[a.monitoring_status]}
              </Badge>
              <ExternalLink className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <div className="space-y-5 p-1">
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>{selected.reason}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap gap-2">
                <Badge>{sourceLabel[selected.source_type]}</Badge>
                <Badge className={priorityTone[effectivePriority(selected)]}>
                  {priorityLabel[effectivePriority(selected)]}
                </Badge>
                <Badge variant="secondary">{statusLabel[selected.monitoring_status]}</Badge>
              </div>
              <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm sm:grid-cols-2">
                <Info l="Cliente" v={selected.client_name} />
                <Info l="Processo" v={selected.process_code} />
                <Info l="Responsável de origem" v={selected.responsible_name} />
                <Info l="Prazo" v={formatDateTime(selected.relevant_at)} />
                <Info l="Situação original" v={selected.source_status} />
                <Info l="Último movimento" v={formatDateTime(selected.last_movement_at)} />
              </dl>
              {canFollowUp && (
                <>
                  <div>
                    <Label>Status do acompanhamento</Label>
                    <Filter
                      value={selected.monitoring_status}
                      set={(v) =>
                        act(
                          () => actions.changeStatus(selected, v as MonitoringStatus),
                          v === "novo" ? "Alerta reaberto." : "Acompanhamento atualizado.",
                        )
                      }
                      label="Status"
                      values={Object.entries(statusLabel).filter(
                        ([value]) =>
                          canAdminMonitoring || ["em_analise", "acompanhado"].includes(value),
                      )}
                      all={false}
                    />
                  </div>
                  {canAdminMonitoring && (
                    <>
                      <div>
                        <Label>Prioridade manual</Label>
                        <Filter
                          value={selected.priority_override ?? "automatica"}
                          set={(v) =>
                            act(
                              () =>
                                actions.priority(
                                  selected,
                                  v === "automatica" ? null : (v as MonitoringPriority),
                                ),
                              "Prioridade atualizada.",
                            )
                          }
                          label="Prioridade"
                          values={[["automatica", "Automática"], ...Object.entries(priorityLabel)]}
                          all={false}
                        />
                      </div>
                      <div>
                        <Label>Responsável pelo acompanhamento</Label>
                        <Filter
                          value={selected.assigned_to ?? "none"}
                          set={(v) =>
                            act(
                              () => actions.assign(selected, v === "none" ? null : v),
                              "Responsável atualizado.",
                            )
                          }
                          label="Responsável"
                          values={[
                            ["none", "Não atribuído"],
                            ...(team.data ?? []).map((m) => [
                              m.user_id,
                              m.full_name ?? m.email ?? "Membro",
                            ]),
                          ]}
                          all={false}
                        />
                      </div>
                    </>
                  )}
                  <Note
                    onSave={(n) => act(() => actions.addNote(selected, n), "Nota adicionada.")}
                  />
                </>
              )}
              {selected.notes && (
                <div>
                  <Label>Notas internas</Label>
                  <p className="mt-1 whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/50 p-3 text-sm">
                    {selected.notes}
                  </p>
                </div>
              )}
              <Button asChild variant="outline">
                <a href={sourcePath(selected)}>
                  <ExternalLink className="size-4" /> Abrir registro original
                </a>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
function Filter({
  value,
  set,
  label,
  values,
  all = true,
}: {
  value: string;
  set: (v: string) => void;
  label: string;
  values: string[][];
  all?: boolean;
}) {
  return (
    <Select value={value} onValueChange={set}>
      <SelectTrigger aria-label={label} className="h-10 rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all && <SelectItem value={ALL}>Todos</SelectItem>}
        {values.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Info({ l, v }: { l: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{l}</dt>
      <dd>{v || "—"}</dd>
    </div>
  );
}
function Note({ onSave }: { onSave: (n: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <Label>Adicionar nota interna</Label>
      <Textarea
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Registre a ação de acompanhamento…"
      />
      <Button
        size="sm"
        disabled={!note.trim()}
        onClick={async () => {
          await onSave(note);
          setNote("");
        }}
      >
        Adicionar nota
      </Button>
    </div>
  );
}
