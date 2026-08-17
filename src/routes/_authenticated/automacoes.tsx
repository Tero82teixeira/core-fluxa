import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, Bot, Copy, History, Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
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
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  canManageAutomations,
  stageCondition,
  stageConditionValue,
  TRIGGER_LABELS,
  type AutomationAction,
  type AutomationTrigger,
} from "@/lib/automations";
import { useTeamMembers } from "@/hooks/use-team";
import { PRIORITY, PROCESS_STAGE, TASK_STATUS, type ProcessStage } from "@/lib/domain";
import {
  useArchiveAutomationRule,
  useAutomationExecutions,
  useAutomationRules,
  useCreateAutomationRule,
  useDuplicateAutomationRule,
  useSetAutomationRuleActive,
  type AutomationInput,
  type AutomationRule,
  useUpdateAutomationRule,
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
  action_config: {
    title: "Nova tarefa automática",
    description: "",
    priority: "media",
    status: "pendente",
    due_in_days: 0,
    assignee_mode: "process_owner",
  },
};

const configText = (config: Record<string, unknown>, key: string) =>
  typeof config[key] === "string" ? config[key] : "";
const configNumber = (config: Record<string, unknown>, key: string) =>
  typeof config[key] === "number" ? config[key] : Number(config[key] ?? 0);
function Page() {
  const { organizationId, role } = useWorkspace();
  const allowed = canManageAutomations(role);
  const rules = useAutomationRules(organizationId);
  const executions = useAutomationExecutions(organizationId);
  const setActive = useSetAutomationRuleActive(organizationId);
  const duplicate = useDuplicateAutomationRule(organizationId);
  const archive = useArchiveAutomationRule(organizationId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [editing, setEditing] = useState<AutomationRule | null | undefined>();
  const [history, setHistory] = useState<AutomationRule | null>(null);
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
          <Button onClick={() => setEditing(null)}>
            <Plus />
            Nova automação
          </Button>
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
                        <DropdownMenuItem onClick={() => setEditing(r)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (r.is_active && !confirm("Desativar esta automação?")) return;
                            void act(
                              () => setActive.mutateAsync(r.id, !r.is_active),
                              r.is_active ? "Automação desativada" : "Automação ativada",
                            );
                          }}
                        >
                          {r.is_active ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            void act(() => duplicate.mutateAsync(r.id), "Automação duplicada")
                          }
                        >
                          <Copy />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            confirm("Arquivar esta automação? Esta ação não exclui o histórico.") &&
                            void act(() => archive.mutateAsync(r.id), "Automação arquivada")
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
  rule: AutomationRule | null;
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
          action_config: rule.action_config,
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
            action_config: rule.action_config,
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
                setForm({
                  ...form,
                  trigger_type: v as AutomationTrigger,
                  conditions:
                    v === "process.stage_changed"
                      ? stageCondition(stageConditionValue(form.conditions) ?? "novo")
                      : form.conditions,
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
                      ? { ...empty.action_config }
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
                {AUTOMATION_ACTIONS.map((a) => (
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
                    {Object.entries(ASSIGNEE_MODE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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
