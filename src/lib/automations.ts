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

// Scheduled rules use dedicated management RPCs. Keep them out of AUTOMATION_TRIGGERS so
// event-based forms cannot submit them through the generic rule RPCs.
export const SCHEDULED_AUTOMATION_TRIGGER = "scheduled" as const;
export type ScheduledAutomationTrigger = typeof SCHEDULED_AUTOMATION_TRIGGER;
export type AutomationRuleTrigger = AutomationTrigger | ScheduledAutomationTrigger;
export type AutomationScheduleType = "interval_days" | "daily";
export const SCHEDULED_AUTOMATION_ACTIONS = [
  "create_task",
  "create_notification",
  "add_audit_log",
] as const;
export type ScheduledAutomationAction = (typeof SCHEDULED_AUTOMATION_ACTIONS)[number];

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

export function defaultCreateTaskConfig(trigger: AutomationTrigger): Record<string, unknown> {
  return {
    title: "Nova tarefa automática",
    description: "",
    priority: "media",
    status: "pendente",
    due_in_days: 0,
    assignee_mode: triggerHasProcessContext(trigger) ? "process_owner" : "unassigned",
  };
}

export function normalizeCreateTaskConfig(
  trigger: AutomationTrigger,
  config: Record<string, unknown>,
): Record<string, unknown> {
  return config.assignee_mode === "process_owner" && !triggerHasProcessContext(trigger)
    ? { ...config, assignee_mode: "unassigned" }
    : { ...config };
}

export function automationDueDays(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 365 ? parsed : 0;
}

export const TRIGGER_LABELS: Record<AutomationRuleTrigger, string> = {
  ...(Object.fromEntries(
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
  ) as Record<AutomationTrigger, string>),
  scheduled: "Por horário",
};

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

const schedulePartsFormatter = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

const dateTimeParts = (value: Date, timezone: string) =>
  Object.fromEntries(
    schedulePartsFormatter(timezone)
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

export function scheduledWallTimeToIso(
  date: string,
  time: string,
  timezone: string,
  now = new Date(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  try {
    schedulePartsFormatter(timezone).format(now);
  } catch {
    return null;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(wallTimeAsUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = dateTimeParts(candidate, timezone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate = new Date(candidate.getTime() + wallTimeAsUtc - representedAsUtc);
  }
  const resultParts = dateTimeParts(candidate, timezone);
  const matchesWallTime =
    resultParts.year === String(year).padStart(4, "0") &&
    resultParts.month === String(month).padStart(2, "0") &&
    resultParts.day === String(day).padStart(2, "0") &&
    resultParts.hour === String(hour).padStart(2, "0") &&
    resultParts.minute === String(minute).padStart(2, "0");
  return matchesWallTime && candidate > now ? candidate.toISOString() : null;
}

export function scheduledWallTimeParts(
  value?: string | null,
  timezone = "America/Sao_Paulo",
) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const safeDate = Number.isNaN(date.getTime())
    ? new Date(Date.now() + 24 * 60 * 60 * 1000)
    : date;
  const parts = dateTimeParts(safeDate, timezone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
