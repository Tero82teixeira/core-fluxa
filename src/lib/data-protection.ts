export type BackupSection = {
  table: string;
  key: string;
  label: string;
};

export const BACKUP_SECTIONS: readonly BackupSection[] = [
  { table: "organization_settings", key: "configuracoes", label: "Configurações" },
  { table: "organization_members", key: "equipe", label: "Equipe" },
  { table: "clients_secure", key: "clientes", label: "Clientes" },
  { table: "client_addresses", key: "enderecos_clientes", label: "Endereços de clientes" },
  { table: "client_contacts", key: "contatos_clientes", label: "Contatos de clientes" },
  { table: "service_types", key: "tipos_servico", label: "Tipos de serviço" },
  { table: "process_stages", key: "etapas_processos", label: "Etapas de processos" },
  { table: "processes", key: "processos", label: "Processos" },
  { table: "process_movements", key: "movimentacoes_processos", label: "Histórico de processos" },
  { table: "process_checklist_items", key: "checklists_processos", label: "Checklists" },
  { table: "tasks", key: "tarefas", label: "Tarefas" },
  { table: "task_comments", key: "comentarios_tarefas", label: "Comentários de tarefas" },
  { table: "task_history", key: "historico_tarefas", label: "Histórico de tarefas" },
  { table: "document_types", key: "tipos_documento", label: "Tipos de documento" },
  { table: "documents", key: "documentos", label: "Inventário de documentos" },
  { table: "document_versions", key: "versoes_documentos", label: "Versões de documentos" },
  {
    table: "document_request_templates",
    key: "modelos_solicitacao",
    label: "Modelos de solicitação",
  },
  {
    table: "client_portal_document_requests",
    key: "solicitacoes_documentos",
    label: "Solicitações de documentos",
  },
  { table: "financial_accounts", key: "contas_financeiras", label: "Contas financeiras" },
  { table: "financial_categories", key: "categorias_financeiras", label: "Categorias financeiras" },
  {
    table: "financial_transactions",
    key: "lancamentos_financeiros",
    label: "Lançamentos financeiros",
  },
  { table: "financial_transaction_payments", key: "pagamentos", label: "Pagamentos" },
  {
    table: "financial_recurrences",
    key: "recorrencias_financeiras",
    label: "Recorrências financeiras",
  },
  {
    table: "financial_account_movements",
    key: "movimentacoes_financeiras",
    label: "Movimentações financeiras",
  },
  { table: "commercial_opportunities", key: "oportunidades", label: "Oportunidades comerciais" },
  {
    table: "commercial_opportunity_stage_history",
    key: "historico_funil",
    label: "Histórico do funil",
  },
  {
    table: "commercial_opportunity_contact_history",
    key: "historico_contatos",
    label: "Histórico de contatos",
  },
  { table: "commercial_proposals", key: "propostas", label: "Propostas comerciais" },
  { table: "communication_threads", key: "conversas", label: "Conversas" },
  { table: "communication_entries", key: "mensagens", label: "Mensagens" },
  { table: "communication_attachments", key: "anexos_conversas", label: "Inventário de anexos" },
  { table: "monitoring_items", key: "monitoramentos", label: "Monitoramentos" },
  {
    table: "monitoring_history",
    key: "historico_monitoramentos",
    label: "Histórico de monitoramentos",
  },
  { table: "lead_capture_forms", key: "formularios_captacao", label: "Formulários de captação" },
  { table: "lead_capture_submissions", key: "leads_captados", label: "Leads captados" },
  { table: "organization_performance_goals", key: "metas_empresa", label: "Metas da empresa" },
  { table: "member_performance_goals", key: "metas_equipe", label: "Metas da equipe" },
  { table: "support_requests", key: "chamados_suporte", label: "Chamados de suporte" },
  { table: "support_request_messages", key: "mensagens_suporte", label: "Mensagens de suporte" },
  { table: "automation_rules", key: "regras_automacao", label: "Regras de automação" },
  {
    table: "automation_schedules",
    key: "agendamentos_automacao",
    label: "Agendamentos de automação",
  },
  { table: "automation_executions", key: "execucoes_automacao", label: "Execuções de automação" },
  { table: "audit_logs", key: "auditoria", label: "Auditoria" },
] as const;

export type OrganizationBackup = {
  manifest: {
    product: "FLUXA";
    version: 1;
    generated_at: string;
    organization_id: string;
    organization_name: string;
    record_count: number;
    section_counts: Record<string, number>;
    restricted_sections: Array<{ key: string; label: string }>;
    unavailable_sections: Array<{ key: string; label: string }>;
    security: string;
    document_notice: string;
  };
  organization: Record<string, unknown> | null;
  data: Record<string, unknown[]>;
};

export function safeBackupName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "empresa"
  );
}

export function backupFileName(organizationName: string, generatedAt: string, compressed: boolean) {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  return `fluxa-backup-${safeBackupName(organizationName)}-${stamp}.json${compressed ? ".gz" : ""}`;
}

export async function backupBlob(payload: OrganizationBackup) {
  const json = JSON.stringify(payload, null, 2);
  if (typeof CompressionStream === "undefined") {
    return { blob: new Blob([json], { type: "application/json" }), compressed: false };
  }
  const stream = new Blob([json], { type: "application/json" })
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return {
    blob: await new Response(stream).blob(),
    compressed: true,
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576)
    return `${(bytes / 1_024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

const ACTION_LABELS: Record<string, string> = {
  "organization.backup.exported": "Backup exportado",
  "client.created": "Cliente criado",
  "client.updated": "Cliente atualizado",
  "client.archived": "Cliente arquivado",
  "process.created": "Processo criado",
  "process.updated": "Processo atualizado",
  "process.stage_changed": "Etapa do processo alterada",
  "task.created": "Tarefa criada",
  "task.updated": "Tarefa atualizada",
  "task.completed": "Tarefa concluída",
  "document.uploaded": "Documento enviado",
  "document.downloaded": "Documento baixado",
  "member.role_changed": "Papel de membro alterado",
  "member.deactivated": "Membro desativado",
  "invite.created": "Convite criado",
  "settings.updated": "Configuração alterada",
};

export function auditActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " › ").replaceAll("_", " ");
}

export function auditMetadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3);
  return entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ");
}
