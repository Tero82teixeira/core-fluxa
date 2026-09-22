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

  { key: "health_patients", label: "Pacientes", description: "Cadastro e acompanhamento administrativo de pacientes.", group: "health", available: true },
  { key: "health_insurance", label: "Convênios", description: "Planos, operadoras e vínculos.", group: "health", available: true },
  { key: "health_authorizations", label: "Autorizações", description: "Solicitações, validade e acompanhamento.", group: "health", available: true },
  { key: "health_billing", label: "Contas Médicas", description: "Faturamento e acompanhamento de recebimentos.", group: "health", available: true },
  { key: "health_denials", label: "Glosas", description: "Controle, recurso e recuperação de valores.", group: "health", available: true },

  { key: "legal_workspace", label: "Recursos Jurídicos", description: "Recursos específicos para operações jurídicas.", group: "legal", available: false },
  { key: "engineering_workspace", label: "Recursos de Engenharia", description: "Projetos, obras e documentação técnica.", group: "engineering", available: false },
  { key: "real_estate_workspace", label: "Recursos Imobiliários", description: "Imóveis, contratos e vistorias.", group: "real_estate", available: false },
];

export type BusinessSubtype =
  | "law_firm"
  | "solo_lawyer"
  | "legal_department"
  | "legal_services"
  | "accounting_firm"
  | "financial_bpo"
  | "tax_services"
  | "accounting_consulting"
  | "engineering_office"
  | "architecture_office"
  | "construction"
  | "technical_services"
  | "regularization"
  | "clinic_office"
  | "medical_billing"
  | "health_service_provider"
  | "diagnostics"
  | "rehabilitation"
  | "brokerage"
  | "property_management"
  | "rentals"
  | "developments"
  | "consulting"
  | "service_company"
  | "administrative_services"
  | "agency"
  | "general_other";

export type SubtypeOption = {
  key: BusinessSubtype;
  label: string;
  description: string;
  recommendedModules?: ModuleKey[];
};

export const SEGMENT_SUBTYPES: Record<BusinessSegment, SubtypeOption[]> = {
  legal: [
    { key: "law_firm", label: "Escritório de advocacia", description: "Equipe jurídica atendendo clientes e processos." },
    { key: "solo_lawyer", label: "Advocacia individual", description: "Profissional autônomo com operação própria." },
    { key: "legal_department", label: "Departamento jurídico", description: "Jurídico interno de uma empresa." },
    { key: "legal_services", label: "Serviços jurídicos", description: "Consultoria, apoio e serviços especializados." },
  ],
  accounting: [
    { key: "accounting_firm", label: "Escritório contábil", description: "Contabilidade recorrente para empresas e pessoas." },
    { key: "financial_bpo", label: "BPO financeiro", description: "Rotinas financeiras terceirizadas para clientes." },
    { key: "tax_services", label: "Fiscal e tributário", description: "Operação focada em obrigações e tributos." },
    { key: "accounting_consulting", label: "Consultoria contábil", description: "Projetos e serviços consultivos." },
  ],
  engineering: [
    { key: "engineering_office", label: "Escritório de engenharia", description: "Projetos, laudos e serviços de engenharia." },
    { key: "architecture_office", label: "Arquitetura", description: "Projetos arquitetônicos e acompanhamento." },
    { key: "construction", label: "Obras e construção", description: "Execução, medição e acompanhamento de obras." },
    { key: "technical_services", label: "Serviços técnicos", description: "Vistorias, laudos, manutenção e campo." },
    { key: "regularization", label: "Regularização", description: "Licenças, aprovações e documentação técnica." },
  ],
  health: [
    {
      key: "clinic_office",
      label: "Clínica ou consultório",
      description: "Atendimento, agenda, pacientes, convênios e financeiro.",
      recommendedModules: [...CORE_MODULES, "health_patients", "health_insurance", "health_authorizations", "health_billing"],
    },
    {
      key: "medical_billing",
      label: "Contas médicas e faturamento",
      description: "Faturamento de convênios, glosas e recebimentos.",
      recommendedModules: [...CORE_MODULES, "health_insurance", "health_authorizations", "health_billing", "health_denials"],
    },
    {
      key: "health_service_provider",
      label: "Prestador de serviços de saúde",
      description: "Profissionais e empresas que prestam serviços para clínicas e pacientes.",
      recommendedModules: [...CORE_MODULES, "health_patients", "health_billing"],
    },
    {
      key: "diagnostics",
      label: "Diagnóstico e exames",
      description: "Laboratórios, imagem e serviços diagnósticos.",
      recommendedModules: [...CORE_MODULES, "health_patients", "health_insurance", "health_authorizations", "health_billing"],
    },
    {
      key: "rehabilitation",
      label: "Reabilitação e terapias",
      description: "Fisioterapia, recuperação, terapias e acompanhamento recorrente.",
      recommendedModules: [...CORE_MODULES, "health_patients", "health_insurance", "health_authorizations", "health_billing"],
    },
  ],
  real_estate: [
    { key: "brokerage", label: "Imobiliária e corretagem", description: "Captação, clientes, imóveis e negociações." },
    { key: "property_management", label: "Administração de imóveis", description: "Contratos, proprietários e operação recorrente." },
    { key: "rentals", label: "Locação", description: "Gestão de locações, vencimentos e financeiro." },
    { key: "developments", label: "Empreendimentos", description: "Comercialização e acompanhamento de unidades." },
  ],
  consulting_services: [
    { key: "consulting", label: "Consultoria", description: "Projetos, entregas e acompanhamento de clientes." },
    { key: "service_company", label: "Empresa de serviços", description: "Operação recorrente de prestação de serviços." },
    { key: "administrative_services", label: "Serviços administrativos", description: "Backoffice, documentação e rotinas operacionais." },
    { key: "agency", label: "Agência", description: "Clientes, demandas, entregas e equipe." },
  ],
  other: [
    { key: "general_other", label: "Outra operação", description: "Comece pelo núcleo do FLUXA e personalize os módulos." },
  ],
};

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

export function subtypeOptionsForSegment(segment: BusinessSegment | null | undefined) {
  return segment ? SEGMENT_SUBTYPES[segment] ?? [] : [];
}

export function subtypeByKey(
  segment: BusinessSegment | null | undefined,
  subtype: string | null | undefined,
) {
  return subtypeOptionsForSegment(segment).find((option) => option.key === subtype) ?? null;
}

export function recommendedModulesForSubtype(
  segment: BusinessSegment,
  subtype: BusinessSubtype | null | undefined,
) {
  const option = subtypeByKey(segment, subtype);
  return option?.recommendedModules ?? recommendedModulesForSegment(segment);
}

const ROUTE_MODULES: Record<string, ModuleKey> = {
  "/clientes": "clients",
  "/saude/pacientes": "health_patients",
  "/saude/convenios": "health_insurance",
  "/saude/autorizacoes": "health_authorizations",
  "/saude/contas-medicas": "health_billing",
  "/saude/lotes-faturamento": "health_billing",
  "/saude/conciliacao": "health_billing",
  "/saude/glosas": "health_denials",
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
  const base = Object.keys(ROUTE_MODULES).find(
    (candidate) => route === candidate || route.startsWith(`${candidate}/`),
  );
  return base ? ROUTE_MODULES[base] : null;
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
