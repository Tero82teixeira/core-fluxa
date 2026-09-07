export type CopilotPrivacyLevel = "safe" | "attention" | "high";

export type CommunicationCopilotResult = {
  summary: string;
  suggested_reply: string;
  privacy: {
    level: CopilotPrivacyLevel;
    warnings: string[];
  };
  next_steps: string[];
  triage: {
    suggested_priority: "baixa" | "normal" | "alta" | "urgente";
    reason: string;
    recommended_action: string;
  };
};

export type CommunicationCopilotResponse = {
  result: CommunicationCopilotResult;
  model: string;
};

export const COPILOT_PRIVACY_LABELS: Record<CopilotPrivacyLevel, string> = {
  safe: "Sem risco identificado",
  attention: "Requer atenção",
  high: "Alto risco",
};

export function parseCommunicationCopilotResponse(value: unknown): CommunicationCopilotResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("COPILOT_INVALID_OUTPUT");
  }
  const response = value as Record<string, unknown>;
  const result = response.result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("COPILOT_INVALID_OUTPUT");
  }
  const parsed = result as Record<string, unknown>;
  const privacy = parsed.privacy;
  if (privacy === null || typeof privacy !== "object" || Array.isArray(privacy)) {
    throw new Error("COPILOT_INVALID_OUTPUT");
  }
  const parsedPrivacy = privacy as Record<string, unknown>;
  const triage = parsed.triage;
  const parsedTriage =
    triage !== null && typeof triage === "object" && !Array.isArray(triage)
      ? (triage as Record<string, unknown>)
      : null;
  const level = parsedPrivacy.level;
  if (
    typeof parsed.summary !== "string" ||
    typeof parsed.suggested_reply !== "string" ||
    !Array.isArray(parsed.next_steps) ||
    !parsed.next_steps.every((item) => typeof item === "string") ||
    !["safe", "attention", "high"].includes(String(level)) ||
    !Array.isArray(parsedPrivacy.warnings) ||
    !parsedPrivacy.warnings.every((item) => typeof item === "string") ||
    !parsedTriage ||
    !["baixa", "normal", "alta", "urgente"].includes(String(parsedTriage.suggested_priority)) ||
    typeof parsedTriage.reason !== "string" ||
    typeof parsedTriage.recommended_action !== "string"
  ) {
    throw new Error("COPILOT_INVALID_OUTPUT");
  }

  return {
    model: typeof response.model === "string" ? response.model : "IA",
    result: {
      summary: parsed.summary,
      suggested_reply: parsed.suggested_reply,
      next_steps: parsed.next_steps as string[],
      privacy: {
        level: level as CopilotPrivacyLevel,
        warnings: parsedPrivacy.warnings as string[],
      },
      triage: {
        suggested_priority: parsedTriage.suggested_priority as
          "baixa" | "normal" | "alta" | "urgente",
        reason: parsedTriage.reason,
        recommended_action: parsedTriage.recommended_action,
      },
    },
  };
}

export function describeCopilotError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("COMMUNICATION_COPILOT_DISABLED"))
    return "O Copiloto está desativado nas Configurações de Comunicação.";
  if (message.includes("COMMUNICATION_COPILOT_RATE_LIMIT"))
    return "O limite de análises desta hora foi atingido. Aguarde para tentar novamente.";
  if (message.includes("COPILOT_NOT_CONFIGURED"))
    return "A integração de IA ainda não foi configurada no Supabase.";
  if (message.includes("COPILOT_PROVIDER_UNAVAILABLE"))
    return "O serviço de IA está temporariamente indisponível. Tente novamente.";
  if (message.includes("DRAFT_REQUIRED")) return "Escreva uma mensagem antes de revisá-la.";
  if (message.includes("DRAFT_TOO_LONG")) return "O rascunho deve ter no máximo 5.000 caracteres.";
  if (message.includes("AUTHENTICATION_REQUIRED"))
    return "Sua sessão expirou. Entre novamente para continuar.";
  return "Não foi possível concluir a análise com IA. Tente novamente.";
}
