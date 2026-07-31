/**
 * Tradução de erros técnicos para mensagens específicas em português.
 * O detalhe técnico fica apenas no console durante o desenvolvimento.
 */

type Ctx =
  | "carregar"
  | "salvar"
  | "cliente"
  | "processo"
  | "etapa"
  | "tarefa"
  | "checklist"
  | "servico"
  | "equipe"
  | "empresa"
  | "documento"
  | "monitoramento"
  | "upload"
  | "auth";

const FALLBACK: Record<Ctx, string> = {
  carregar: "Não foi possível carregar as informações. Tente novamente.",
  salvar: "Não foi possível salvar. Revise os dados e tente novamente.",
  cliente: "Não foi possível salvar o cliente. Revise os dados e tente novamente.",
  processo: "Não foi possível salvar o processo. Revise os dados e tente novamente.",
  etapa: "Não foi possível alterar a etapa do processo. Tente novamente.",
  tarefa: "Não foi possível salvar a tarefa. Tente novamente.",
  checklist: "Não foi possível atualizar o checklist. Tente novamente.",
  servico: "Não foi possível salvar o tipo de serviço. Tente novamente.",
  equipe: "Não foi possível atualizar a equipe. Tente novamente.",
  empresa: "Não foi possível salvar os dados da empresa. Tente novamente.",
  documento: "Não foi possível concluir a ação no documento. Tente novamente.",
  monitoramento: "Não foi possível atualizar o item de monitoramento. Tente novamente.",
  upload: "Não foi possível enviar o arquivo. Verifique o formato e tente novamente.",
  auth: "Não foi possível concluir. Tente novamente em instantes.",
};

export function logTechnical(context: string, error: unknown) {
  if (import.meta.env.DEV) console.error(`[FLUXA:${context}]`, error);
}

function read(error: unknown, key: string): string {
  const value = (error as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : "";
}

/** Mensagem amigável e específica para o usuário final. */
export function describeError(error: unknown, context: Ctx = "salvar"): string {
  logTechnical(context, error);

  const code = read(error, "code");
  const message = `${read(error, "message")} ${read(error, "details")} ${read(error, "hint")}`.toLowerCase();

  if (!navigator.onLine || message.includes("failed to fetch") || message.includes("networkerror"))
    return "Conexão indisponível. Verifique sua internet e tente novamente.";
  if (message.includes("jwt") || message.includes("session") || code === "401" || read(error, "status") === "401")
    return "Sua sessão expirou. Entre novamente para continuar.";
  if (code === "23505" || message.includes("duplicate key")) {
    if (message.includes("clients_org_document_unique") || context === "cliente")
      return "Já existe um cliente com este CPF/CNPJ nesta empresa.";
    return "Este registro já existe.";
  }
  if (code === "23503") return "Registro relacionado não encontrado. Atualize a página e tente novamente.";
  if (code === "42501" || code === "PGRST301" || message.includes("row-level security") || message.includes("permission denied"))
    return "Você não tem permissão para executar esta ação.";
  if (code === "PGRST116" || message.includes("not found")) return "Registro não encontrado ou já removido.";
  if (message.includes("already registered")) return "Já existe uma conta com este e-mail.";

  return FALLBACK[context];
}

/** Mensagens específicas do Supabase Auth. */
export function describeAuthError(error: unknown): string {
  logTechnical("auth", error);
  const message = read(error, "message").toLowerCase();
  const status = (error as { status?: number } | null)?.status;

  if (message.includes("invalid login credentials")) return "E-mail ou senha incorretos. Verifique e tente novamente.";
  if (message.includes("email not confirmed")) return "Sua conta ainda não foi verificada. Confira o e-mail de confirmação.";
  if (message.includes("already registered") || message.includes("already been registered"))
    return "Já existe uma conta com este e-mail. Faça login para continuar.";
  if (message.includes("user not found")) return "Não encontramos uma conta com este e-mail.";
  if (message.includes("rate limit") || message.includes("too many") || status === 429)
    return "Muitas tentativas. Aguarde alguns instantes antes de tentar novamente.";
  if (message.includes("password") && message.includes("6")) return "A senha deve ter pelo menos 6 caracteres.";
  if (message.includes("weak") || message.includes("pwned"))
    return "Esta senha é muito fraca ou já apareceu em vazamentos. Escolha outra.";
  if (message.includes("expired") || message.includes("invalid token"))
    return "Este link expirou. Solicite um novo e-mail de redefinição.";
  if (message.includes("failed to fetch") || message.includes("network"))
    return "Conexão indisponível. Verifique sua internet e tente novamente.";
  return "Não foi possível concluir. Tente novamente em instantes.";
}
