export const ORGANIZATION_SETTINGS_DEFAULTS = {
  timezone: "America/Sao_Paulo",
  locale: "pt-BR",
  date_format: "dd/MM/yyyy",
  currency: "BRL",
  week_starts_on: 1,
  business_hours_start: "08:00",
  business_hours_end: "18:00",
  default_task_due_days: 7,
  default_task_priority: "media",
  stale_process_days: 14,
  allow_overdue_task_without_reason: false,
  default_communication_channel: "interno",
  default_communication_priority: "media",
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
    stale_processes: true,
    overdue_communications: true,
    overdue_accounts: true,
    expiring_documents: true,
    critical_monitoring: true,
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
  created_at: string;
  updated_at: string | null;
  member_count: number;
  client_count: number;
  active_process_count: number;
  recent_audit: Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown>;
    created_at: string;
    actor_name: string | null;
  }>;
  default_financial_account_id: string | null;
  default_income_category_id: string | null;
  default_expense_category_id: string | null;
  default_responsible_id: string | null;
} & Omit<typeof ORGANIZATION_SETTINGS_DEFAULTS, "notification_preferences"> & {
    notification_preferences: Record<string, boolean>;
  };

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
    value.business_hours_start &&
    value.business_hours_end &&
    value.business_hours_start >= value.business_hours_end
  )
    errors.push("O horário final deve ser posterior ao inicial.");
  for (const key of [
    "default_task_due_days",
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
