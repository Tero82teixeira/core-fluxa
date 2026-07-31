import type {
  LayoutDashboard,
} from "lucide-react";

export type ClientStatus = "lead" | "em_cadastro" | "ativo" | "com_pendencia" | "inativo" | "arquivado";
export type ProcessStage =
  | "novo"
  | "aguardando_documentos"
  | "documentos_conferencia"
  | "montagem"
  | "pronto_protocolo"
  | "protocolado"
  | "em_analise"
  | "exigencia"
  | "deferido"
  | "finalizado"
  | "arquivado"
  | "cancelado";
export type PriorityLevel = "baixa" | "media" | "alta" | "critica";
export type TaskStatus =
  | "pendente"
  | "em_andamento"
  | "aguardando"
  | "concluida"
  | "cancelada"
  | "arquivada";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly";
export type FinancialStatus = "nao_aplicavel" | "pendente" | "parcial" | "pago" | "atrasado";
export type AppRole =
  | "superadmin"
  | "proprietario"
  | "administrador"
  | "gestor"
  | "operacional"
  | "atendimento"
  | "financeiro"
  | "visualizador"
  | "cliente_externo";

/** Tom semântico usado pelos selos de status (nunca decorativo). */
export type Tone = "neutral" | "info" | "success" | "warning" | "caution" | "danger";

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  lead: { label: "Lead", tone: "info" },
  em_cadastro: { label: "Em cadastro", tone: "neutral" },
  ativo: { label: "Ativo", tone: "success" },
  com_pendencia: { label: "Com pendência", tone: "warning" },
  inativo: { label: "Inativo", tone: "neutral" },
  arquivado: { label: "Arquivado", tone: "neutral" },
};

export const PROCESS_STAGE: Record<ProcessStage, { label: string; tone: Tone; short: string }> = {
  novo: { label: "Novo", short: "Entrada", tone: "info" },
  aguardando_documentos: { label: "Aguardando documentos", short: "Documentação", tone: "warning" },
  documentos_conferencia: { label: "Documentos em conferência", short: "Conferência", tone: "warning" },
  montagem: { label: "Montagem", short: "Montagem", tone: "neutral" },
  pronto_protocolo: { label: "Pronto para protocolo", short: "Pronto", tone: "info" },
  protocolado: { label: "Protocolado", short: "Protocolado", tone: "info" },
  em_analise: { label: "Em análise", short: "Em análise", tone: "info" },
  exigencia: { label: "Exigência", short: "Pendência", tone: "danger" },
  deferido: { label: "Deferido", short: "Deferido", tone: "success" },
  finalizado: { label: "Finalizado", short: "Concluído", tone: "success" },
  arquivado: { label: "Arquivado", short: "Arquivado", tone: "neutral" },
  cancelado: { label: "Cancelado", short: "Cancelado", tone: "neutral" },
};

export const KANBAN_STAGES: ProcessStage[] = [
  "novo",
  "aguardando_documentos",
  "documentos_conferencia",
  "montagem",
  "pronto_protocolo",
  "protocolado",
  "em_analise",
  "exigencia",
  "deferido",
  "finalizado",
];

export const PIPELINE_STAGES: { key: ProcessStage[]; label: string }[] = [
  { key: ["novo"], label: "Entrada" },
  { key: ["aguardando_documentos", "documentos_conferencia"], label: "Documentação" },
  { key: ["montagem"], label: "Montagem" },
  { key: ["pronto_protocolo", "protocolado"], label: "Protocolado" },
  { key: ["em_analise"], label: "Em análise" },
  { key: ["exigencia"], label: "Pendência" },
  { key: ["deferido", "finalizado"], label: "Concluído" },
];

export const PRIORITY: Record<PriorityLevel, { label: string; tone: Tone }> = {
  baixa: { label: "Baixa", tone: "neutral" },
  media: { label: "Média", tone: "info" },
  alta: { label: "Alta", tone: "caution" },
  critica: { label: "Urgente", tone: "danger" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  pendente: { label: "Pendente", tone: "neutral" },
  em_andamento: { label: "Em andamento", tone: "info" },
  aguardando: { label: "Aguardando", tone: "warning" },
  concluida: { label: "Concluída", tone: "success" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  arquivada: { label: "Arquivada", tone: "neutral" },
};

/** Colunas do quadro de tarefas (arrastar e soltar). */
export const TASK_BOARD_STATUSES: TaskStatus[] = ["pendente", "em_andamento", "aguardando", "concluida"];

export const TASK_OPEN_STATUSES: TaskStatus[] = ["pendente", "em_andamento", "aguardando"];

export const RECURRENCE: Record<RecurrenceType, { label: string }> = {
  none: { label: "Sem recorrência" },
  daily: { label: "Diária" },
  weekly: { label: "Semanal" },
  monthly: { label: "Mensal" },
};

/** Funções oficiais oferecidas na gestão de equipe (valores internos já padronizados no banco). */
export const TEAM_ROLES: AppRole[] = ["proprietario", "administrador", "operacional", "visualizador"];

export const FINANCIAL_STATUS: Record<FinancialStatus, { label: string; tone: Tone }> = {
  nao_aplicavel: { label: "Não aplicável", tone: "neutral" },
  pendente: { label: "Pendente", tone: "warning" },
  parcial: { label: "Parcial", tone: "info" },
  pago: { label: "Pago", tone: "success" },
  atrasado: { label: "Atrasado", tone: "danger" },
};

export const ROLE: Record<AppRole, { label: string; description: string }> = {
  superadmin: { label: "Superadministrador", description: "Administração da plataforma FLUXA." },
  proprietario: { label: "Proprietário", description: "Controle total do workspace da empresa." },
  administrador: { label: "Administrador", description: "Gestão de equipe, configurações e operação." },
  gestor: { label: "Gestor", description: "Acompanha operação, prazos e desempenho da equipe." },
  operacional: { label: "Operacional", description: "Executa processos, documentos e tarefas." },
  atendimento: { label: "Atendimento", description: "Relacionamento com clientes e comunicação." },
  financeiro: { label: "Financeiro", description: "Acesso a valores, cobranças e recebimentos." },
  visualizador: { label: "Visualizador", description: "Somente leitura dos dados operacionais." },
  cliente_externo: { label: "Cliente externo", description: "Acessa apenas os próprios processos no portal." },
};

export const PERMISSION_KEYS = [
  "clients.view",
  "clients.create",
  "clients.edit",
  "clients.delete",
  "processes.view",
  "processes.create",
  "processes.edit",
  "processes.delete",
  "finance.view",
  "reports.export",
  "settings.manage",
  "team.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const CLIENT_RANGES = ["Até 50", "51 a 100", "101 a 500", "501 a 1.000", "Mais de 1.000"];
export const EMPLOYEE_RANGES = ["1 a 10", "11 a 30", "31 a 100", "Mais de 100"];
export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export type IconType = typeof LayoutDashboard;
