import type { Tone } from "@/lib/domain";

export const DOCUMENTS_BUCKET = "organization-documents";

export type DocumentStatus =
  | "pendente"
  | "recebido"
  | "em_analise"
  | "aprovado"
  | "rejeitado"
  | "vencido"
  | "arquivado";

export type DocumentCategory =
  | "identificacao"
  | "certidao"
  | "comprovante"
  | "contrato"
  | "formulario"
  | "autorizacao"
  | "registro"
  | "licenca"
  | "financeiro"
  | "outros";

export type MonitoringStatus = "ativo" | "em_renovacao" | "renovado" | "arquivado";

export type MonitoringSituation =
  | "arquivado"
  | "sem_validade"
  | "vencido"
  | "vence_hoje"
  | "ate_7"
  | "ate_15"
  | "ate_30"
  | "ate_60"
  | "regular";

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  pendente: { label: "Pendente", tone: "warning" },
  recebido: { label: "Recebido", tone: "info" },
  em_analise: { label: "Em análise", tone: "info" },
  aprovado: { label: "Aprovado", tone: "success" },
  rejeitado: { label: "Rejeitado", tone: "danger" },
  vencido: { label: "Vencido", tone: "danger" },
  arquivado: { label: "Arquivado", tone: "neutral" },
};

export const DOCUMENT_CATEGORY: Record<DocumentCategory, { label: string }> = {
  identificacao: { label: "Identificação" },
  certidao: { label: "Certidão" },
  comprovante: { label: "Comprovante" },
  contrato: { label: "Contrato" },
  formulario: { label: "Formulário" },
  autorizacao: { label: "Autorização" },
  registro: { label: "Registro" },
  licenca: { label: "Licença" },
  financeiro: { label: "Financeiro" },
  outros: { label: "Outros" },
};

export const MONITORING_STATUS: Record<MonitoringStatus, { label: string; tone: Tone }> = {
  ativo: { label: "Ativo", tone: "info" },
  em_renovacao: { label: "Em renovação", tone: "warning" },
  renovado: { label: "Renovado", tone: "success" },
  arquivado: { label: "Arquivado", tone: "neutral" },
};

export const MONITORING_SITUATION: Record<MonitoringSituation, { label: string; tone: Tone }> = {
  arquivado: { label: "Arquivado", tone: "neutral" },
  sem_validade: { label: "Sem validade", tone: "neutral" },
  vencido: { label: "Vencido", tone: "danger" },
  vence_hoje: { label: "Vence hoje", tone: "danger" },
  ate_7: { label: "Vence em até 7 dias", tone: "danger" },
  ate_15: { label: "Vence em até 15 dias", tone: "warning" },
  ate_30: { label: "Vence em até 30 dias", tone: "warning" },
  ate_60: { label: "Vence em até 60 dias", tone: "caution" },
  regular: { label: "Regular", tone: "success" },
};

/** Formatos aceitos no upload — validados antes de qualquer envio. */
export const ACCEPTED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "docx", "xlsx"] as const;

export const ACCEPTED_MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function fileExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/** Mensagem específica de rejeição, ou null quando o arquivo é aceito. */
export function validateFile(file: File): string | null {
  const extension = fileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return "Formato não aceito. Envie PDF, JPG, PNG, DOCX ou XLSX.";
  }
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_FILE_SIZE) {
    return `Arquivo acima do limite de ${formatFileSize(MAX_FILE_SIZE)}.`;
  }
  const expected = ACCEPTED_MIME[extension] ?? [];
  if (file.type && expected.length > 0 && !expected.includes(file.type)) {
    return "O conteúdo do arquivo não corresponde à extensão informada.";
  }
  return null;
}

export function formatFileSize(bytes?: number | null) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Caminho no bucket privado: sempre iniciado pelo id da empresa (isolamento). */
export function buildStoragePath(input: {
  organizationId: string;
  clientId?: string | null;
  processId?: string | null;
  extension: string;
}) {
  const scope = input.processId
    ? `processos/${input.processId}`
    : input.clientId
      ? `clientes/${input.clientId}`
      : "geral";
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    path: `${input.organizationId}/${scope}/${unique}.${input.extension}`,
    storedFileName: `${unique}.${input.extension}`,
  };
}

/** Validade sugerida a partir do tipo de documento. */
export function suggestExpiration(issueDate: string, days?: number | null) {
  if (!issueDate || !days) return "";
  const base = new Date(`${issueDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}
