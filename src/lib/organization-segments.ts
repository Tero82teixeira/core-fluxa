import {
  BriefcaseBusiness,
  Building2,
  Calculator,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export type BusinessSegment =
  | "legal"
  | "accounting"
  | "engineering"
  | "health"
  | "real_estate"
  | "consulting_services"
  | "other";

export type ModuleKey =
  | "clients"
  | "processes"
  | "documents"
  | "tasks"
  | "communication"
  | "finance"
  | "monitoring"
  | "reports"
  | "automations"
  | "client_portal"
  | "health_patients"
  | "health_insurance"
  | "health_authorizations"
  | "health_billing"
  | "health_denials"
  | "legal_workspace"
  | "engineering_workspace"
  | "real_estate_workspace";

export const CORE_MODULES: ModuleKey[] = [
  "clients",
  "processes",
  "documents",
  "tasks",
  "communication",
  "finance",
  "monitoring",
  "reports",
  "automations",
  "client_portal",
];

export const MODULE_CATALOG: Array<{
  key: ModuleKey;
  label: string;
  description: string;
  group: "core" | "health" | "legal" | "engineering" | "real_estate";
  available: boolean;
}> = [
  { key: "clients", label: "Clientes", description: "Carteira e relacionamento.", group: "core", available: true },
  { key: "processes", label: "Processos", description: "Etapas, prazos e protocolos.", group: "core", available: true },
  { key: "documents", label: "Documentos", description: "Arquivos, solicitações e validades.", group: "core", available: true },
  { key: "tasks", label: "Tarefas", description: "Agenda operacional e responsáveis.", group: "core", available: true },
  { key: "communication", label: "Comunicação", description: "Histórico e acompanhamento de contatos.", group: "core", available: true },
  { key: "finance", label: "Financeiro", description: "Receitas, contas e cobranças.", group: "core", available: true },
  { key: "monitoring", label: "Monitoramento", description: "Prazos, alertas e vencimentos.", group: "core", available: true },
  { key: "reports", label: "Relatórios", description: "Indicadores e visão gerencial.", group: "core", available: true },
  { key: "automations", label: "Automações", description: "Regras, lembretes e disparos.", group: "core", available: true },
  { key: "client_portal", label: "Portal do Cliente", description: "Experiência externa e autoatendimento.", group: "core", available: true },

  { key: "health_patients", label: "Pacientes", description: "Cadastro e acompanhamento administrativo de pacientes.", group: "health", available: false },
  { key: "health_insurance", label: "Convênios", description: "Planos, operadoras e vínculos.", group: "health", available: false },
  { key: "health_authorizations", label: "Autorizações", description: "Solicitações, validade e acompanhamento.", group: "health", available: false },
  { key: "health_billing", label: "Contas Médicas", description: "Faturamento e acompanhamento de recebimentos.", group: "health", available: false },
  { key: "health_denials", label: "Glosas", description: "Controle, recurso e recuperação de valores.", group: "health", available: false },

  { key: "legal_workspace", label: "Recursos Jurídicos", description: "Recursos específicos para operações jurídicas.", group: "legal", available: false },
  { key: "engineering_workspace", label: "Recursos de Engenharia", description: "Projetos, obras e documentação técnica.", group: "engineering", available: false },
  { key: "real_estate_workspace", label: "Recursos Imobiliários", description: "Imóveis, contratos e vistorias.", group: "real_estate", available: false },
];

export type SegmentOption = {
  key: BusinessSegment;
  label: string;
  description: string;
  icon: LucideIcon;
  recommendedModules: ModuleKey[];
};

export const SEGMENT_OPTIONS: SegmentOption[] = [
  {
    key: "legal",
    label: "Advocacia",
    description: "Escritórios, departamentos jurídicos e profissionais do Direito.",
    icon: Landmark,
    recommendedModules: [...CORE_MODULES, "legal_workspace"],
  },
  {
    key: "accounting",
    label: "Contabilidade",
    description: "Escritórios contábeis, BPO financeiro e serviços fiscais.",
    icon: Calculator,
    recommendedModules: CORE_MODULES,
  },
  {
    key: "engineering",
    label: "Engenharia e Arquitetura",
    description: "Projetos, obras, regularizações e serviços técnicos.",
    icon: Building2,
    recommendedModules: [...CORE_MODULES, "engineering_workspace"],
  },
  {
    key: "health",
    label: "Clínica e Saúde",
    description: "Clínicas, consultórios e operações administrativas em saúde.",
    icon: HeartPulse,
    recommendedModules: [
      ...CORE_MODULES,
      "health_patients",
      "health_insurance",
      "health_authorizations",
      "health_billing",
      "health_denials",
    ],
  },
  {
    key: "real_estate",
    label: "Imobiliária",
    description: "Imobiliárias, administradoras, locação e gestão de imóveis.",
    icon: Home,
    recommendedModules: [...CORE_MODULES, "real_estate_workspace"],
  },
  {
    key: "consulting_services",
    label: "Consultoria e Serviços",
    description: "Consultorias, assessorias e empresas prestadoras de serviços.",
    icon: BriefcaseBusiness,
    recommendedModules: CORE_MODULES,
  },
  {
    key: "other",
    label: "Outro segmento",
    description: "Configure o FLUXA com o núcleo operacional e personalize depois.",
    icon: BriefcaseBusiness,
    recommendedModules: CORE_MODULES,
  },
];

const ROUTE_MODULES: Record<string, ModuleKey> = {
  "/clientes": "clients",
  "/processos": "processes",
  "/documentos": "documents",
  "/tarefas": "tasks",
  "/comunicacao": "communication",
  "/financeiro": "finance",
  "/monitoramento": "monitoring",
  "/relatorios": "reports",
  "/automacoes": "automations",
};

export function segmentByKey(key: string | null | undefined) {
  return SEGMENT_OPTIONS.find((segment) => segment.key === key) ?? null;
}

export function recommendedModulesForSegment(segment: BusinessSegment) {
  return segmentByKey(segment)?.recommendedModules ?? CORE_MODULES;
}

export function enabledModulesFromUnknown(value: unknown): ModuleKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(MODULE_CATALOG.map((module) => module.key));
  return value.filter((module): module is ModuleKey => typeof module === "string" && allowed.has(module as ModuleKey));
}

export function moduleForRoute(route: string): ModuleKey | null {
  return ROUTE_MODULES[route] ?? null;
}

export function routeVisibleForModules(
  route: string,
  businessSegment: string | null | undefined,
  enabledModules: unknown,
) {
  if (!businessSegment) return true;
  const module = moduleForRoute(route);
  if (!module) return true;
  const enabled = enabledModulesFromUnknown(enabledModules);
  if (enabled.length === 0) return true;
  return enabled.includes(module);
}
