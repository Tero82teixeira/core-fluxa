export type IntegrationHealthStatus =
  | "healthy"
  | "attention"
  | "pending"
  | "not_configured"
  | "not_reported"
  | "outdated";

export type IntegrationHealthItem = {
  integration_key: string;
  label: string;
  category: "servico" | "implantacao";
  status: IntegrationHealthStatus;
  expected_version: string | null;
  reported_version: string | null;
  last_activity_at: string | null;
  pending_count: number;
  error_count: number;
  last_error_code: string | null;
  action_url: string;
  action_label: string;
};

export const INTEGRATION_STATUS_LABEL: Record<IntegrationHealthStatus, string> = {
  healthy: "Funcionando",
  attention: "Precisa de atenção",
  pending: "Pendente",
  not_configured: "Não configurada",
  not_reported: "Versão não informada",
  outdated: "Publicação desatualizada",
};

export function integrationHealthSummary(items: IntegrationHealthItem[]) {
  return {
    healthy: items.filter((item) => item.status === "healthy").length,
    attention: items.filter((item) =>
      ["attention", "not_reported", "outdated"].includes(item.status),
    ).length,
    pending: items.filter((item) => item.status === "pending").length,
    notConfigured: items.filter((item) => item.status === "not_configured").length,
  };
}

export function integrationDiagnosticMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "FUNCTION_VERSION_NOT_REPORTED")
    return "Esta função ainda não confirmou a versão que está executando.";
  if (code === "FUNCTION_VERSION_OUTDATED")
    return "O código publicado está atrás da versão esperada no GitHub.";
  if (code === "ASAAS_invalid_mobilePhone")
    return "O telefone ou WhatsApp do cliente precisa ser corrigido.";
  if (code === "ASAAS_NOT_CONNECTED") return "A conta Asaas precisa ser conectada novamente.";
  if (code === "PAST_DUE") return "A assinatura está com pagamento atrasado.";
  return code.replaceAll("_", " ");
}
