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

export type DeploymentNotice = "outdated" | "awaiting_first_run" | "verified";
export type IntegrationActivityState = "never" | "recent" | "silent" | null;

export function integrationActivityState(
  item: IntegrationHealthItem,
  now = new Date(),
  silentDays = 30,
): IntegrationActivityState {
  if (item.category !== "servico" || item.status !== "healthy") return null;
  if (!item.last_activity_at) return "never";
  const lastActivity = new Date(item.last_activity_at).getTime();
  if (!Number.isFinite(lastActivity)) return "never";
  return now.getTime() - lastActivity > silentDays * 24 * 60 * 60 * 1000 ? "silent" : "recent";
}

export function integrationDeploymentNotice(items: IntegrationHealthItem[]): DeploymentNotice {
  const deployments = items.filter((item) => item.category === "implantacao");
  if (deployments.some((item) => item.status === "outdated")) return "outdated";
  if (deployments.some((item) => item.status === "not_reported")) return "awaiting_first_run";
  return "verified";
}

export function integrationHealthSummary(items: IntegrationHealthItem[]) {
  const silent = items.filter((item) => integrationActivityState(item) === "silent").length;
  return {
    healthy: items.filter(
      (item) => item.status === "healthy" && integrationActivityState(item) !== "silent",
    ).length,
    silent,
    attention: items.filter((item) => ["attention", "outdated"].includes(item.status)).length,
    awaitingConfirmation: items.filter((item) => item.status === "not_reported").length,
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
  if (code === "CHANNEL_NOT_CONFIGURED") return "Este canal ainda não está configurado.";
  if (code === "WHATSAPP_SECRETS_MISSING")
    return "As credenciais do WhatsApp não estão disponíveis na publicação.";
  if (code === "RESEND_API_KEY_MISSING")
    return "A credencial de envio de e-mail não está disponível na publicação.";
  if (code === "COPILOT_NOT_CONFIGURED") return "O Copiloto ainda não está configurado.";
  if (code === "COPILOT_RATE_LIMITED")
    return "O provedor da IA atingiu o limite temporário de uso.";
  if (code === "CREDENTIAL_VALIDATION_STALE") return "Esta conexão precisa ser validada novamente.";
  if (code === "CREDENTIAL_TEST_RECOMMENDED")
    return "Execute um teste para confirmar a credencial ativa.";
  if (code === "PUSH_NO_ACTIVE_DEVICE")
    return "Nenhum aparelho está habilitado para receber notificações.";
  if (code === "CHARGE_NOT_FOUND")
    return "A cobrança relacionada ao evento ainda não foi localizada.";
  if (/^(WHATSAPP|RESEND|OPENAI)_\d+$/.test(code))
    return "O provedor recusou o teste. Verifique a credencial e a configuração.";
  if (code === "PAST_DUE") return "A assinatura está com pagamento atrasado.";
  return code.replaceAll("_", " ");
}
