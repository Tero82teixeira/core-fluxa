export const AUTOMATION_TRIGGERS = [
  "task.created",
  "task.status_changed",
  "task.assignee_changed",
  "task.due_date_changed",
  "task.completed",
  "process.created",
  "process.stage_changed",
  "process.owner_changed",
  "monitoring.created",
  "monitoring.status_changed",
  "monitoring.expiration_changed",
  "monitoring.responsible_changed",
] as const;

export const AUTOMATION_ACTIONS = [
  "create_task",
  "create_checklist_item",
  "update_task_priority",
  "update_task_status",
  "add_task_history",
  "create_notification",
  "add_audit_log",
] as const;
export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "is_empty",
  "is_not_empty",
  "before",
  "after",
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
export type AutomationCondition = { field: string; operator: ConditionOperator; value?: string };
export type AssigneeMode = "process_owner" | "fixed_user" | "rule_creator" | "unassigned";

export const PROCESS_AUTOMATION_TRIGGERS: readonly AutomationTrigger[] = [
  "process.created",
  "process.stage_changed",
  "process.owner_changed",
];

export const ASSIGNEE_MODE_LABELS: Record<AssigneeMode, string> = {
  process_owner: "Responsável do processo",
  fixed_user: "Usuário específico",
  rule_creator: "Criador da automação",
  unassigned: "Sem responsável",
};

export function stageCondition(value: string): AutomationCondition[] {
  return [{ field: "to_stage", operator: "equals", value }];
}

export function stageConditionValue(conditions: AutomationCondition[]) {
  return conditions.find(
    (condition) => condition.field === "to_stage" || condition.field === "stage",
  )?.value;
}

export function removeStageConditions(conditions: AutomationCondition[]) {
  return conditions.filter(
    (condition) => condition.field !== "to_stage" && condition.field !== "stage",
  );
}

export function triggerHasProcessContext(trigger: AutomationTrigger) {
  return PROCESS_AUTOMATION_TRIGGERS.includes(trigger);
}

export function actionsForTrigger(trigger: AutomationTrigger): AutomationAction[] {
  return AUTOMATION_ACTIONS.filter(
    (action) => action !== "create_checklist_item" || triggerHasProcessContext(trigger),
  );
}

export function assigneeModesForTrigger(trigger: AutomationTrigger): AssigneeMode[] {
  return (Object.keys(ASSIGNEE_MODE_LABELS) as AssigneeMode[]).filter(
    (mode) => mode !== "process_owner" || triggerHasProcessContext(trigger),
  );
}

export function automationDueDays(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 365 ? parsed : 0;
}

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = Object.fromEntries(
  AUTOMATION_TRIGGERS.map((value) => [
    value,
    value
      .replace("task", "Tarefa")
      .replace("process", "Processo")
      .replace("monitoring", "Monitoramento")
      .replace("created", "criado")
      .replace("status_changed", "status alterado")
      .replace("assignee_changed", "responsável alterado")
      .replace("due_date_changed", "prazo alterado")
      .replace("completed", "concluída")
      .replace("stage_changed", "etapa alterada")
      .replace("owner_changed", "proprietário alterado")
      .replace("expiration_changed", "vencimento alterado")
      .replace("responsible_changed", "responsável alterado")
      .replace(".", " — "),
  ]),
) as Record<AutomationTrigger, string>;

export const ACTION_LABELS: Record<AutomationAction, string> = {
  create_task: "Criar tarefa",
  create_checklist_item: "Criar item de checklist",
  update_task_priority: "Atualizar prioridade",
  update_task_status: "Atualizar status",
  add_task_history: "Registrar histórico",
  create_notification: "Criar notificação interna",
  add_audit_log: "Registrar auditoria",
};

export function canManageAutomations(role: string | null | undefined) {
  return role === "proprietario" || role === "administrador" || role === "superadmin";
}
