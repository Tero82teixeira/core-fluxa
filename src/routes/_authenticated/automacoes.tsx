import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  Bot,
  CalendarClock,
  Copy,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/lib/workspace";
import {
  ACTION_LABELS,
  ASSIGNEE_MODE_LABELS,
  AUTOMATION_TRIGGERS,
  actionsForTrigger,
  assigneeModesForTrigger,
  canManageAutomations,
  defaultCreateTaskConfig,
  normalizeCreateTaskConfig,
  removeStageConditions,
  scheduledWallTimeParts,
  scheduledWallTimeToIso,
  stageCondition,
  stageConditionValue,
  TRIGGER_LABELS,
  type AutomationAction,
  type AutomationTrigger,
  type ScheduledAutomationAction,
} from "@/lib/automations";
import { useTeamMembers } from "@/hooks/use-team";
import { PRIORITY, PROCESS_STAGE, TASK_STATUS, type ProcessStage } from "@/lib/domain";
import {
  useArchiveAutomationRule,
  useArchiveScheduledAutomation,
  useAutomationExecutions,
  useAutomationRules,
  useAutomationSchedules,
  useCreateAutomationRule,
  useCreateScheduledAutomation,
  useDuplicateAutomationRule,
  useSetAutomationRuleActive,
  useSetScheduledAutomationActive,
  type AutomationInput,
  type AutomationRule,
  type AutomationSchedule,
  type ScheduledAutomationInput,
  useUpdateAutomationRule,
  useUpdateScheduledAutomation,
} from "@/hooks/use-automations";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações — FLUXA" },
      { name: "description", content: "Regras automáticas internas da operação." },
    ],
  }),
  component: Page,
});
const empty: AutomationInput = {
  name: "",
  description: "",
  is_active: true,
  trigger_type: "task.created",
  conditions: [],
  action_type: "create_task",
  action_config: defaultCreateTaskConfig("task.created"),
};
type EventAutomationRule = AutomationRule & { trigger_type: AutomationTrigger };

const configText = (config: Record<string, unknown>, key: string) =>
  typeof config[key] === "string" ? config[key] : "";
const configNumber = (config: Record<string, unknown>, key: string) =>
  typeof config[key] === "number" ? config[key] : Number(config[key] ?? 0);
function Page() {
  const { organizationId, role } = useWorkspace();
  const allowed = canManageAutomations(role);
  const rules = useAutomationRules(organizationId);
  const executions = useAutomationExecutions(organizationId);
  const schedules = useAutomationSchedules(organizationId);
  const setActive = useSetAutomationRuleActive(organizationId);
  const setScheduledActive = useSetScheduledAutomationActive(organizationId);
  const duplicate = useDuplicateAutomationRule(organizationId);
  const archive = useArchiveAutomationRule(organizationId);
  const archiveScheduled = useArchiveScheduledAutomation(organizationId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [editing, setEditing] = useState<EventAutomationRule | null | undefined>();
  const [scheduledEditing, setScheduledEditing] = useState<AutomationRule | null | undefined>();
  const [history, setHistory] = useState<AutomationRule | null>(null);
  const scheduleByRule = useMemo(
    () => new Map((schedules.data ?? []).map((schedule) => [schedule.automation_rule_id, schedule])),
    [schedules.data],
  );
  const filtered = useMemo(
    () =>
      (rules.data ?? []).filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) &&
          (status === "all" || String(r.is_active) === (status === "active" ? "true" : "false")) &&
          (trigger === "all" || r.trigger_type === trigger),
      ),
    [rules.data, search, status, trigger],
  );
  const active = (rules.data ?? []).filter((r) => r.is_active).length;
  const failed = (executions.data ?? []).filter((e) => e.status === "failed").length;
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
    } catch {
      toast.error("Não foi possível concluir a ação.");
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bot className="size-6 text-primary" />
            Automações
          </h1>
          <p className="text-sm text-muted-foreground">
            Crie regras internas seguras para reduzir tarefas repetitivas.
          </p>
        </div>
        {allowed && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              <Plus />
              Nova por evento
            </Button>
            <Button onClick={() => setScheduledEditing(null)}>
              <CalendarClock />
              Nova por horário
            </Button>
          </div>
        )}
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total", rules.data?.length ?? 0],
          ["Ativas", active],
          ["Inativas", (rules.data?.length ?? 0) - active],
          ["Execuções recentes", executions.data?.length ?? 0],
          ["Falhas recentes", failed],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_240px]">
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome…"
            aria-label="Buscar automações"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filtrar status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="inactive">Inativas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={trigger} onValueChange={setTrigger}>
          <SelectTrigger aria-label="Filtrar gatilho">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os gatilhos</SelectItem>
            {AUTOMATION_TRIGGERS.map((t) => (
              <SelectItem key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </SelectItem>
            ))}
            <SelectItem value="scheduled">Por horário</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {rules.isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin" />
        </div>
      ) : rules.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            Não foi possível carregar as automações.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bot className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p className="font-medium">Nenhuma automação encontrada</p>
            <p className="text-sm text-muted-foreground">
              Ajuste os filtros ou crie sua primeira regra.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{r.name}</h2>
                    <Badge variant={r.is_active ? "default" : "secondary"}>
                      {r.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.description || "Sem descrição"}
                  </p>
                  <p className="mt-2 text-sm">
                    <strong>{TRIGGER_LABELS[r.trigger_type]}</strong> →{" "}
                    {ACTION_LABELS[r.action_type]}
                  </p>
                  {r.trigger_type === "scheduled" && scheduleByRule.get(r.id) && (
                    <p className="text-sm text-muted-foreground">
                      {scheduleByRule.get(r.id)!.schedule_type === "daily"
                        ? `Todos os dias às ${scheduleByRule.get(r.id)!.run_at?.slice(0, 5)}`
                        : `A cada ${scheduleByRule.get(r.id)!.interval_days} dia(s)`}
                      {` · próxima: ${formatDateTime(scheduleByRule.get(r.id)!.next_execution_at)}`}
                    </p>
                  )}
                  {r.trigger_type === "process.stage_changed" &&
                    stageConditionValue(r.conditions) && (
                      <p className="text-sm text-muted-foreground">
                        {PROCESS_STAGE[stageConditionValue(r.conditions) as ProcessStage]?.label ??
                          stageConditionValue(r.conditions)}
                      </p>
                    )}
                  {typeof r.action_config.title === "string" && (
                    <p className="text-sm">{r.action_config.title}</p>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    <dt>Última execução</dt>
                    <dd>{r.last_executed_at ? formatDateTime(r.last_executed_at) : "Nunca"}</dd>
                  </div>
                  <div>
                    <dt>Execuções / falhas</dt>
                    <dd>
                      {r.execution_count} / {r.failure_count}
                    </dd>
                  </div>
                  <div>
                    <dt>Criador</dt>
                    <dd>{r.creator_name || "Usuário"}</dd>
                  </div>
                  <div>
                    <dt>Criação</dt>
                    <dd>{formatDateTime(r.created_at)}</dd>
                  </div>
                </dl>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Ações de ${r.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setHistory(r)}>
                      <History />
                      Visualizar histórico
                    </DropdownMenuItem>
                    {allowed && (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            r.trigger_type === "scheduled"
                              ? scheduleByRule.has(r.id)
                                ? setScheduledEditing(r)
                                : toast.error("A programação ainda está carregando.")
                              : setEditing(r as EventAutomationRule)
                          }
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (r.is_active && !confirm("Desativar esta automação?")) return;
                            void act(
                              () =>
                                r.trigger_type === "scheduled"
                                  ? setScheduledActive.mutateAsync(r.id, !r.is_active)
                                  : setActive.mutateAsync(r.id, !r.is_active),
                              r.is_active ? "Automação desativada" : "Automação ativada",
                            );
                          }}
                        >
                          {r.is_active ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        {r.trigger_type !== "scheduled" && (
                          <DropdownMenuItem
                            onClick={() =>
                              void act(() => duplicate.mutateAsync(r.id), "Automação duplicada")
                            }
                          >
                            <Copy />
                            Duplicar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            confirm("Arquivar esta automação? Esta ação não exclui o histórico.") &&
                            void act(
                              () =>
                                r.trigger_type === "scheduled"
                                  ? archiveScheduled.mutateAsync(r.id)
                                  : archive.mutateAsync(r.id),
                              "Automação arquivada",
                            )
                          }
                        >
                          <Archive />
                          Arquivar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AutomationForm
        open={editing !== undefined}
        rule={editing ?? null}
        organizationId={organizationId}
        onClose={() => setEditing(undefined)}
      />
      <ScheduledAutomationForm
        open={scheduledEditing !== undefined}
        rule={scheduledEditing ?? null}
        schedule={scheduledEditing ? scheduleByRule.get(scheduledEditing.id) ?? null : null}
        organizationId={organizationId}
        onClose={() => setScheduledEditing(undefined)}
      />
      <HistoryPanel
        rule={history}
        organizationId={organizationId}
        onClose={() => setHistory(null)}
      />
    </div>
  );
}

function AutomationForm({
  open,
  rule,
  organizationId,
  onClose,
}: {
  open: boolean;
  rule: EventAutomationRule | null;
  organizationId: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AutomationInput>(
    rule
      ? {
          name: rule.name,
          description: rule.description,
          trigger_type: rule.trigger_type,
          conditions: rule.conditions,
          action_type: rule.action_type,
          action_config:
            rule.action_type === "create_task"
              ? normalizeCreateTaskConfig(rule.trigger_type, rule.action_config)
              : rule.action_config,
          is_active: rule.is_active,
        }
      : empty,
  );
  const create = useCreateAutomationRule(organizationId),
    update = useUpdateAutomationRule(organizationId);
  const members = useTeamMembers(organizationId);
  useEffect(() => {
    setForm(
      rule
        ? {
            name: rule.name,
            description: rule.description,
            trigger_type: rule.trigger_type,
            conditions: rule.conditions,
            action_type: rule.action_type,
            action_config:
              rule.action_type === "create_task"
                ? normalizeCreateTaskConfig(rule.trigger_type, rule.action_config)
                : rule.action_config,
            is_active: rule.is_active,
          }
        : { ...empty, action_config: { ...empty.action_config } },
    );
  }, [rule, open]);
  const setConfig = (key: string, value: unknown) =>
    setForm({ ...form, action_config: { ...form.action_config, [key]: value } });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (rule) {
        await update.mutateAsync(rule.id, form);
      } else {
        await create.mutateAsync(form);
      }
      toast.success(rule ? "Automação atualizada" : "Automação criada");
      onClose();
    } catch {
      toast.error("Revise os campos e tente novamente.");
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{rule ? "Editar automação" : "Nova automação"}</SheetTitle>
          <SheetDescription>
            Somente gatilhos, condições e ações previamente permitidos.
          </SheetDescription>
        </SheetHeader>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <div>
            <Label htmlFor="automation-name">Nome</Label>
            <Input
              id="automation-name"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="automation-description">Descrição</Label>
            <Textarea
              id="automation-description"
              maxLength={500}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="automation-active">Ativa</Label>
            <Switch
              id="automation-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
          <div>
            <Label>Gatilho</Label>
            <Select
              value={form.trigger_type}
              onValueChange={(v) =>
                setForm((current) => {
                  const nextTrigger = v as AutomationTrigger;
                  const compatibleActions = actionsForTrigger(nextTrigger);
                  const actionRemainsCompatible = compatibleActions.includes(current.action_type);
                  const nextConfig = actionRemainsCompatible
                    ? current.action_type === "create_task"
                      ? normalizeCreateTaskConfig(nextTrigger, current.action_config)
                      : { ...current.action_config }
                    : defaultCreateTaskConfig(nextTrigger);
                  return {
                    ...current,
                    trigger_type: nextTrigger,
                    conditions:
                      nextTrigger === "process.stage_changed"
                        ? [
                            ...removeStageConditions(current.conditions),
                            ...stageCondition(stageConditionValue(current.conditions) ?? "novo"),
                          ]
                        : removeStageConditions(current.conditions),
                    action_type: actionRemainsCompatible ? current.action_type : "create_task",
                    action_config: nextConfig,
                  };
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_TRIGGERS.map((t) => (
                  <SelectItem value={t} key={t}>
                    {TRIGGER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.trigger_type === "process.stage_changed" && (
            <div>
              <Label>Quando o processo mudar para</Label>
              <Select
                value={stageConditionValue(form.conditions) ?? "novo"}
                onValueChange={(value) => setForm({ ...form, conditions: stageCondition(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROCESS_STAGE) as ProcessStage[]).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {PROCESS_STAGE[stage].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Ação</Label>
            <Select
              value={form.action_type}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  action_type: v as AutomationAction,
                  action_config:
                    v === "create_task"
                      ? defaultCreateTaskConfig(form.trigger_type)
                      : v === "create_checklist_item"
                        ? { title: "", description: "", required: true, due_in_days: 0 }
                        : {},
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {actionsForTrigger(form.trigger_type).map((a) => (
                  <SelectItem value={a} key={a}>
                    {ACTION_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.action_type === "create_task" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="task-title">Título</Label>
                <Input
                  id="task-title"
                  required
                  maxLength={160}
                  value={configText(form.action_config, "title")}
                  onChange={(e) => setConfig("title", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="task-description">Descrição</Label>
                <Textarea
                  id="task-description"
                  maxLength={2000}
                  value={configText(form.action_config, "description")}
                  onChange={(e) => setConfig("description", e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Prioridade</Label>
                  <Select
                    value={configText(form.action_config, "priority") || "media"}
                    onValueChange={(v) => setConfig("priority", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["baixa", "media", "alta", "critica"] as const).map((v) => (
                        <SelectItem key={v} value={v}>
                          {PRIORITY[v].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status inicial</Label>
                  <Select
                    value={configText(form.action_config, "status") || "pendente"}
                    onValueChange={(v) => setConfig("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["pendente", "em_andamento", "aguardando"] as const).map((v) => (
                        <SelectItem key={v} value={v}>
                          {TASK_STATUS[v].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="task-due">Prazo em dias</Label>
                <Input
                  id="task-due"
                  type="number"
                  required
                  min={0}
                  max={365}
                  value={configNumber(form.action_config, "due_in_days")}
                  onChange={(e) => setConfig("due_in_days", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Responsável</Label>
                <Select
                  value={
                    configText(form.action_config, "assignee_mode") ||
                    (form.action_config.assignee_id ? "fixed_user" : "unassigned")
                  }
                  onValueChange={(v) => setConfig("assignee_mode", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assigneeModesForTrigger(form.trigger_type).map((value) => (
                      <SelectItem key={value} value={value}>
                        {ASSIGNEE_MODE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(configText(form.action_config, "assignee_mode") === "fixed_user" ||
                (!form.action_config.assignee_mode && Boolean(form.action_config.assignee_id))) && (
                <div>
                  <Label>Usuário específico</Label>
                  <Select
                    value={configText(form.action_config, "assignee_id")}
                    onValueChange={(v) => setConfig("assignee_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um membro ativo" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.data
                        ?.filter((m) => m.is_active)
                        .map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.full_name || m.email || "Usuário"}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {form.action_type === "create_checklist_item" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="checklist-title">Título</Label>
                <Input
                  id="checklist-title"
                  required
                  maxLength={160}
                  value={configText(form.action_config, "title")}
                  onChange={(e) => setConfig("title", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="checklist-description">Descrição</Label>
                <Textarea
                  id="checklist-description"
                  maxLength={2000}
                  value={configText(form.action_config, "description")}
                  onChange={(e) => setConfig("description", e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="checklist-required">Obrigatório</Label>
                <Switch
                  id="checklist-required"
                  checked={form.action_config.required !== false}
                  onCheckedChange={(v) => setConfig("required", v)}
                />
              </div>
              <div>
                <Label htmlFor="checklist-due">Prazo em dias</Label>
                <Input
                  id="checklist-due"
                  type="number"
                  required
                  min={0}
                  max={365}
                  value={configNumber(form.action_config, "due_in_days")}
                  onChange={(e) => setConfig("due_in_days", Number(e.target.value))}
                />
              </div>
            </div>
          )}
          {!(["create_task", "create_checklist_item"] as string[]).includes(form.action_type) && (
            <div>
              <Label htmlFor="action-value">Parâmetro principal</Label>
              <Input
                id="action-value"
                required
                value={String(
                  form.action_config.message ??
                    form.action_config.priority ??
                    form.action_config.status ??
                    "",
                )}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action_config: {
                      [form.action_type === "update_task_priority"
                        ? "priority"
                        : form.action_type === "update_task_status"
                          ? "status"
                          : "message"]: e.target.value,
                    },
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Não são aceitos código, SQL nem URLs externas.
              </p>
            </div>
          )}
          <Button className="w-full" disabled={create.isPending || update.isPending}>
            {(create.isPending || update.isPending) && <Loader2 className="animate-spin" />}Salvar
            automação
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const defaultScheduledConfig = (action: ScheduledAutomationAction) => {
  if (action === "create_task") {
    return {
      title: "Nova tarefa programada",
      description: "",
      priority: "media",
      status: "pendente",
      due_in_days: 0,
      assignee_mode: "unassigned",
    };
  }
  if (action === "create_notification") {
    return { title: "", body: "", recipient_id: "" };
  }
  return { message: "" };
};

function scheduledInput(
  rule: AutomationRule | null,
  schedule: AutomationSchedule | null,
): ScheduledAutomationInput {
  const action = (rule?.action_type ?? "create_task") as ScheduledAutomationAction;
  const parts = scheduledWallTimeParts(schedule?.next_execution_at, schedule?.timezone);
  const storedConfig = rule ? { ...rule.action_config } : defaultScheduledConfig(action);
  const actionConfig =
    action === "create_task"
      ? {
          ...storedConfig,
          assignee_mode:
            storedConfig.assignee_mode ??
            (storedConfig.assignee_id ? "fixed_user" : "unassigned"),
        }
      : storedConfig;
  return {
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    action_type: action,
    action_config: actionConfig,
    schedule_type: schedule?.schedule_type ?? "daily",
    interval_days: schedule?.interval_days ?? null,
    run_at: schedule?.run_at?.slice(0, 5) ?? parts.time,
    timezone: schedule?.timezone ?? "America/Sao_Paulo",
    next_execution_at: schedule?.next_execution_at ?? "",
    is_active: rule?.is_active ?? true,
  };
}

function ScheduledAutomationForm({
  open,
  rule,
  schedule,
  organizationId,
  onClose,
}: {
  open: boolean;
  rule: AutomationRule | null;
  schedule: AutomationSchedule | null;
  organizationId: string | null;
  onClose: () => void;
}) {
  const initialParts = scheduledWallTimeParts(schedule?.next_execution_at, schedule?.timezone);
  const [form, setForm] = useState<ScheduledAutomationInput>(() =>
    scheduledInput(rule, schedule),
  );
  const [startDate, setStartDate] = useState(initialParts.date);
  const [startTime, setStartTime] = useState(initialParts.time);
  const create = useCreateScheduledAutomation(organizationId);
  const update = useUpdateScheduledAutomation(organizationId);
  const members = useTeamMembers(organizationId);

  useEffect(() => {
    const parts = scheduledWallTimeParts(schedule?.next_execution_at, schedule?.timezone);
    setForm(scheduledInput(rule, schedule));
    setStartDate(parts.date);
    setStartTime(parts.time);
  }, [open, rule, schedule]);

  const setConfig = (key: string, value: unknown) =>
    setForm((current) => ({
      ...current,
      action_config: { ...current.action_config, [key]: value },
    }));

  const setAssigneeMode = (mode: string) =>
    setForm((current) => {
      const config = { ...current.action_config, assignee_mode: mode };
      if (mode !== "fixed_user") delete config.assignee_id;
      return { ...current, action_config: config };
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextExecution = scheduledWallTimeToIso(
      startDate,
      startTime,
      form.timezone,
    );
    if (!nextExecution) {
      toast.error("Escolha uma primeira execução futura.");
      return;
    }
    if (
      form.action_type === "create_task" &&
      form.action_config.assignee_mode === "fixed_user" &&
      !form.action_config.assignee_id
    ) {
      toast.error("Selecione o responsável da tarefa.");
      return;
    }
    if (form.action_type === "create_notification" && !form.action_config.recipient_id) {
      toast.error("Selecione quem receberá a notificação.");
      return;
    }
    const payload: ScheduledAutomationInput = {
      ...form,
      interval_days: form.schedule_type === "interval_days" ? form.interval_days || 1 : null,
      run_at: form.schedule_type === "daily" ? startTime : null,
      next_execution_at: nextExecution,
    };
    try {
      if (rule) await update.mutateAsync(rule.id, payload);
      else await create.mutateAsync(payload);
      toast.success(rule ? "Automação programada atualizada" : "Automação programada criada");
      onClose();
    } catch {
      toast.error("Revise os campos da programação e tente novamente.");
    }
  };

  const pending = create.isPending || update.isPending;
  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {rule ? "Editar automação por horário" : "Nova automação por horário"}
          </SheetTitle>
          <SheetDescription>
            Programe uma tarefa, notificação ou registro interno com segurança.
          </SheetDescription>
        </SheetHeader>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            Depois da ativação operacional, os horários serão verificados a cada 15 minutos.
          </div>
          <div>
            <Label htmlFor="scheduled-name">Nome</Label>
            <Input
              id="scheduled-name"
              required
              maxLength={120}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="scheduled-description">Descrição</Label>
            <Textarea
              id="scheduled-description"
              maxLength={500}
              value={form.description ?? ""}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="scheduled-active">Ativa</Label>
            <Switch
              id="scheduled-active"
              checked={form.is_active}
              onCheckedChange={(value) => setForm({ ...form, is_active: value })}
            />
          </div>
          <div>
            <Label>Repetição</Label>
            <Select
              value={form.schedule_type}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  schedule_type: value as ScheduledAutomationInput["schedule_type"],
                  interval_days: value === "interval_days" ? form.interval_days || 1 : null,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Todos os dias</SelectItem>
                <SelectItem value="interval_days">A cada alguns dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.schedule_type === "interval_days" && (
            <div>
              <Label htmlFor="scheduled-interval">Repetir a cada</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="scheduled-interval"
                  type="number"
                  required
                  min={1}
                  max={3650}
                  value={form.interval_days ?? 1}
                  onChange={(event) =>
                    setForm({ ...form, interval_days: Number(event.target.value) })
                  }
                />
                <span className="text-sm text-muted-foreground">dia(s)</span>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="scheduled-date">Primeira execução</Label>
              <Input
                id="scheduled-date"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scheduled-time">Horário</Label>
              <Input
                id="scheduled-time"
                type="time"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Fuso horário</Label>
            <Select
              value={form.timezone}
              onValueChange={(value) => setForm({ ...form, timezone: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">Brasília</SelectItem>
                <SelectItem value="America/Manaus">Manaus</SelectItem>
                <SelectItem value="America/Rio_Branco">Rio Branco</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ação</Label>
            <Select
              value={form.action_type}
              onValueChange={(value) => {
                const action = value as ScheduledAutomationAction;
                setForm({
                  ...form,
                  action_type: action,
                  action_config: defaultScheduledConfig(action),
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["create_task", "create_notification", "add_audit_log"] as const).map(
                  (action) => (
                    <SelectItem key={action} value={action}>
                      {ACTION_LABELS[action]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          {form.action_type === "create_task" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="scheduled-task-title">Título da tarefa</Label>
                <Input
                  id="scheduled-task-title"
                  required
                  maxLength={160}
                  value={configText(form.action_config, "title")}
                  onChange={(event) => setConfig("title", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="scheduled-task-description">Descrição</Label>
                <Textarea
                  id="scheduled-task-description"
                  maxLength={2000}
                  value={configText(form.action_config, "description")}
                  onChange={(event) => setConfig("description", event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Prioridade</Label>
                  <Select
                    value={configText(form.action_config, "priority") || "media"}
                    onValueChange={(value) => setConfig("priority", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["baixa", "media", "alta", "critica"] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIORITY[value].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status inicial</Label>
                  <Select
                    value={configText(form.action_config, "status") || "pendente"}
                    onValueChange={(value) => setConfig("status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["pendente", "em_andamento", "aguardando"] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {TASK_STATUS[value].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="scheduled-task-due">Prazo em dias</Label>
                <Input
                  id="scheduled-task-due"
                  type="number"
                  required
                  min={0}
                  max={365}
                  value={configNumber(form.action_config, "due_in_days")}
                  onChange={(event) => setConfig("due_in_days", Number(event.target.value))}
                />
              </div>
              <div>
                <Label>Responsável</Label>
                <Select
                  value={configText(form.action_config, "assignee_mode") || "unassigned"}
                  onValueChange={setAssigneeMode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    <SelectItem value="rule_creator">Criador da automação</SelectItem>
                    <SelectItem value="fixed_user">Usuário específico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.action_config.assignee_mode === "fixed_user" && (
                <div>
                  <Label>Usuário específico</Label>
                  <Select
                    value={configText(form.action_config, "assignee_id")}
                    onValueChange={(value) => setConfig("assignee_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um membro ativo" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.data?.filter((member) => member.is_active).map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email || "Usuário"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {form.action_type === "create_notification" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="scheduled-notification-title">Título da notificação</Label>
                <Input
                  id="scheduled-notification-title"
                  required
                  value={configText(form.action_config, "title")}
                  onChange={(event) => setConfig("title", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="scheduled-notification-body">Mensagem</Label>
                <Textarea
                  id="scheduled-notification-body"
                  value={configText(form.action_config, "body")}
                  onChange={(event) => setConfig("body", event.target.value)}
                />
              </div>
              <div>
                <Label>Destinatário</Label>
                <Select
                  value={configText(form.action_config, "recipient_id")}
                  onValueChange={(value) => setConfig("recipient_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um membro ativo" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.data?.filter((member) => member.is_active).map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name || member.email || "Usuário"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {form.action_type === "add_audit_log" && (
            <div>
              <Label htmlFor="scheduled-audit-message">Mensagem do registro</Label>
              <Input
                id="scheduled-audit-message"
                required
                maxLength={500}
                value={configText(form.action_config, "message")}
                onChange={(event) => setConfig("message", event.target.value)}
              />
            </div>
          )}
          <Button className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Salvar automação por horário
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function HistoryPanel({
  rule,
  organizationId,
  onClose,
}: {
  rule: AutomationRule | null;
  organizationId: string | null;
  onClose: () => void;
}) {
  const q = useAutomationExecutions(organizationId, rule?.id);
  return (
    <Sheet
      open={Boolean(rule)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Histórico — {rule?.name}</SheetTitle>
          <SheetDescription>
            Tentativas recentes, incluindo falhas e execuções ignoradas.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {q.isLoading ? (
            <Loader2 className="animate-spin" />
          ) : q.data?.length ? (
            q.data.map((e) => (
              <Card key={e.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between">
                    <Badge variant={e.status === "success" ? "default" : "secondary"}>
                      {e.status}
                    </Badge>
                    <time className="text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm">{e.event_type}</p>
                  <p className="text-xs text-muted-foreground">
                    Entidade: {e.entity_type}
                    {e.entity_id ? ` · ${e.entity_id}` : ""}
                  </p>
                  {(e.output_payload?.action || rule) && (
                    <p className="text-xs text-muted-foreground">
                      Ação: {ACTION_LABELS[e.output_payload?.action ?? rule!.action_type]}
                    </p>
                  )}
                  {e.error_message && <p className="text-sm text-destructive">{e.error_message}</p>}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Esta automação ainda não possui execuções.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
