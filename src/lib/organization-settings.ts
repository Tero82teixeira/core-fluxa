export type CommunicationChannel =
  "whatsapp" | "telefone" | "email" | "presencial" | "interno" | "outro";
export type CommunicationPriority = "baixa" | "normal" | "alta" | "urgente";
export type TaskPriority = "baixa" | "media" | "alta" | "critica";

export const ORGANIZATION_SETTINGS_DEFAULTS = {
  timezone: "America/Sao_Paulo",
  locale: "pt-BR",
  date_format: "dd/MM/yyyy",
  currency: "BRL",
  week_starts_on: 1,
  business_hours_start: "08:00",
  business_hours_end: "18:00",
  default_task_due_days: 7,
  default_task_priority: "media" as TaskPriority,
  stale_task_days: 5,
  stale_process_days: 14,
  allow_overdue_task_without_reason: false,
  default_communication_channel: "interno" as CommunicationChannel,
  default_communication_priority: "normal" as CommunicationPriority,
  default_follow_up_hours: 24,
  highlight_internal_notes: true,
  financial_alert_days: 7,
  monitoring_financial_high_threshold: 10000,
  monitoring_financial_critical_threshold: 50000,
  monitoring_upcoming_days: 7,
  monitoring_document_expiration_days: 30,
  monitoring_show_financial: true,
  monitoring_show_communication: true,
  monitoring_show_documents: true,
  notification_preferences: {
    overdue_tasks: true,
    stale_tasks: true,
    stale_processes: true,
    overdue_communications: true,
    portal_sla_alerts: true,
    overdue_accounts: true,
    expiring_documents: true,
    critical_monitoring: true,
    unassigned_monitoring: true,
    deadline_reminders: true,
    client_birthdays: true,
    stale_leads: true,
    daily_operational_close: true,
    weekly_productivity_report: true,
  },
};

export type OrganizationSettings = {
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  created_at: string | null;
  updated_at: string | null;
  member_count: number;
  client_count: number;
  active_process_count: number;
  recent_audit: Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown>;
    created_at: string | null;
    actor_name: string | null;
  }>;
  default_financial_account_id: string | null;
  default_income_category_id: string | null;
  default_expense_category_id: string | null;
  default_responsible_id: string | null;
  default_task_priority: TaskPriority;
  default_communication_channel: CommunicationChannel;
  default_communication_priority: CommunicationPriority;
} & Omit<
  typeof ORGANIZATION_SETTINGS_DEFAULTS,
  | "notification_preferences"
  | "default_task_priority"
  | "default_communication_channel"
  | "default_communication_priority"
> & {
    notification_preferences: Record<string, boolean>;
  };

const nullableStringFields = [
  "trade_name",
  "document",
  "email",
  "phone",
  "website",
  "zip_code",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "created_at",
  "updated_at",
  "default_financial_account_id",
  "default_income_category_id",
  "default_expense_category_id",
  "default_responsible_id",
] as const;

/** Converts the versioned RPC payload into the complete shape consumed by the page. */
export function normalizeOrganizationSettings(data: unknown): OrganizationSettings {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Resposta inválida ao carregar as configurações da organização.");
  }

  const source = data as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...ORGANIZATION_SETTINGS_DEFAULTS,
    organization_id: typeof source.organization_id === "string" ? source.organization_id : "",
    legal_name: typeof source.legal_name === "string" ? source.legal_name : "Organização",
    member_count: typeof source.member_count === "number" ? source.member_count : 0,
    client_count: typeof source.client_count === "number" ? source.client_count : 0,
    active_process_count:
      typeof source.active_process_count === "number" ? source.active_process_count : 0,
  };

  for (const [key, fallback] of Object.entries(ORGANIZATION_SETTINGS_DEFAULTS)) {
    if (key === "notification_preferences") continue;
    normalized[key] = source[key] ?? fallback;
  }
  for (const key of nullableStringFields) {
    normalized[key] = typeof source[key] === "string" ? source[key] : null;
  }

  const preferences = source.notification_preferences;
  normalized.notification_preferences = {
    ...ORGANIZATION_SETTINGS_DEFAULTS.notification_preferences,
    ...(preferences !== null && typeof preferences === "object" && !Array.isArray(preferences)
      ? preferences
      : {}),
  };
  normalized.recent_audit = Array.isArray(source.recent_audit)
    ? source.recent_audit
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
        )
        .map((entry, index) => ({
          id: typeof entry.id === "string" ? entry.id : `audit-${index}`,
          action: typeof entry.action === "string" ? entry.action : "update",
          metadata:
            entry.metadata !== null &&
            typeof entry.metadata === "object" &&
            !Array.isArray(entry.metadata)
              ? (entry.metadata as Record<string, unknown>)
              : {},
          created_at: typeof entry.created_at === "string" ? entry.created_at : null,
          actor_name: typeof entry.actor_name === "string" ? entry.actor_name : null,
        }))
    : [];

  return normalized as OrganizationSettings;
}

export function formatOptionalDate(value: unknown, includeTime = false): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return includeTime ? date.toLocaleString("pt-BR") : date.toLocaleDateString("pt-BR");
}

export function formatUpcomingDaysLabel(value: unknown): string {
  const days =
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365
      ? value
      : ORGANIZATION_SETTINGS_DEFAULTS.monitoring_upcoming_days;
  return days === 1 ? "Próximo 1 dia" : `Próximos ${days} dias`;
}

export function getRoleLabel(
  role: string | null | undefined,
  roles: Record<string, { label: string }>,
): string {
  return (role && roles[role]?.label) || "—";
}

export function validateOrganizationSettings(value: Partial<OrganizationSettings>): string[] {
  const errors: string[] = [];
  if (
    value.timezone &&
    ![
      "America/Sao_Paulo",
      "America/Manaus",
      "America/Fortaleza",
      "America/Recife",
      "America/Bahia",
      "America/Belem",
      "America/Cuiaba",
      "America/Porto_Velho",
      "America/Rio_Branco",
      "UTC",
    ].includes(value.timezone)
  )
    errors.push("Fuso horário inválido.");
  if (value.locale && !["pt-BR", "en-US", "es-ES"].includes(value.locale))
    errors.push("Idioma inválido.");
  if (value.currency && !["BRL", "USD", "EUR"].includes(value.currency))
    errors.push("Moeda inválida.");
  if (
    value.default_communication_channel &&
    !["whatsapp", "telefone", "email", "presencial", "interno", "outro"].includes(
      value.default_communication_channel,
    )
  )
    errors.push("Canal de comunicação inválido.");
  if (
    value.default_communication_priority &&
    !["baixa", "normal", "alta", "urgente"].includes(value.default_communication_priority)
  )
    errors.push("Prioridade de comunicação inválida.");
  if (
    value.business_hours_start &&
    value.business_hours_end &&
    value.business_hours_start >= value.business_hours_end
  )
    errors.push("O horário final deve ser posterior ao inicial.");
  for (const key of [
    "default_task_due_days",
    "stale_task_days",
    "stale_process_days",
    "financial_alert_days",
    "monitoring_upcoming_days",
    "monitoring_document_expiration_days",
  ] as const) {
    const number = value[key];
    if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 365))
      errors.push(`${key}: informe entre 1 e 365 dias.`);
  }
  if (
    value.monitoring_financial_high_threshold !== undefined &&
    value.monitoring_financial_high_threshold < 0
  )
    errors.push("O limite alto não pode ser negativo.");
  if (
    value.monitoring_financial_critical_threshold !== undefined &&
    value.monitoring_financial_high_threshold !== undefined &&
    value.monitoring_financial_critical_threshold <= value.monitoring_financial_high_threshold
  )
    errors.push("O limite crítico deve ser maior que o limite alto.");
  return errors;
}
