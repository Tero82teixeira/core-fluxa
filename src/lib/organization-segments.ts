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

export function segmentByKey(key: string | null | undefined) {
  return SEGMENT_OPTIONS.find((segment) => segment.key === key) ?? null;
}

export function recommendedModulesForSegment(segment: BusinessSegment) {
  return segmentByKey(segment)?.recommendedModules ?? CORE_MODULES;
}
