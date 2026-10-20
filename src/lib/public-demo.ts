/**
 * Demonstração pública da FLUXA — fixtures 100% locais e fictícias.
 * Este módulo NUNCA importa o cliente do banco, autenticação ou dados reais.
 * Tudo aqui vive na memória do navegador e some ao recarregar a página.
 */
import type { BusinessSegment } from "./organization-segments";

export type DemoModule = "plans" | "attendance" | "proposals" | "overview" | "records" | "cases" | "schedule" | "tasks" | "documents" | "finance";

export const DEMO_AREAS: BusinessSegment[] = [
  "legal",
  "accounting",
  "engineering",
  "health",
  "real_estate",
  "consulting_services",
  "other",
];

/** Módulos compatíveis por área (espelha a segmentação real: nada jurídico em Saúde etc.). */
export const DEMO_AREA_MODULES: Record<BusinessSegment, DemoModule[]> = {
  legal: ["overview", "schedule", "records", "cases", "tasks", "documents", "finance"],
  accounting: ["overview", "records", "cases", "tasks", "documents", "finance"],
  engineering: ["overview", "records", "cases", "tasks", "documents", "finance"],
  health: ["overview", "records", "schedule", "cases", "tasks", "finance"],
  real_estate: ["overview", "cases", "records", "schedule", "tasks", "finance"],
  consulting_services: ["overview", "records", "attendance", "proposals", "cases", "plans", "schedule", "tasks", "documents", "finance"],
  other: ["overview", "records", "cases", "tasks", "finance"],
};

export function isDemoArea(value: unknown): value is BusinessSegment {
  return typeof value === "string" && (DEMO_AREAS as string[]).includes(value);
}

export function demoModulesFor(area: BusinessSegment): DemoModule[] {
  return DEMO_AREA_MODULES[area];
}

export type DemoStatus = "active" | "pending" | "late" | "done" | "scheduled" | "paid" | "open" | "review" | "valid" | "expiring";

export type DemoRecord = { id: string; name: string; kind: "company" | "person" | "patient" | "owner"; status: DemoStatus; owner: string; city: string };
export type DemoCase = { id: string; code: string; titleKey: string; recordId: string; status: DemoStatus; stage: number; due: string; amount: number };
export type DemoTask = { title?:string; id: string; titleKey: string; due: string; priority: "high" | "medium" | "low"; done: boolean; owner: string };
export type DemoFinance = { id: string; descKey: string; type: "income" | "expense"; amount: number; due: string; status: DemoStatus };
export type DemoSchedule = { id: string; date: string; typeKey: string; recordId: string };
export type DemoDocument = { id: string; nameKey: string; recordId: string; status: DemoStatus; expires: string };

export type DemoData = {
  records: DemoRecord[];
  cases: DemoCase[];
  tasks: DemoTask[];
  finance: DemoFinance[];
  schedule: DemoSchedule[];
  documents: DemoDocument[];
};

const TEAM = ["Ana R.", "Bruno M.", "Carla S.", "Diego T."];

const RECORD_NAMES: Record<string, Array<[string, DemoRecord["kind"]]>> = {
  default: [
    ["Aurora Tecnologia Ltda", "company"],
    ["Vale Verde Comércio", "company"],
    ["Helena Prado (fictícia)", "person"],
    ["Orion Logística S.A.", "company"],
    ["Rafael Nunes (fictício)", "person"],
  ],
  health: [
    ["Marina A. (paciente fictícia)", "patient"],
    ["João P. (paciente fictício)", "patient"],
    ["Luíza C. (paciente fictícia)", "patient"],
    ["Pedro H. (paciente fictício)", "patient"],
    ["Sofia R. (paciente fictícia)", "patient"],
  ],
  real_estate: [
    ["Grupo Atlântico Imóveis", "company"],
    ["Teresa Lima (fictícia)", "owner"],
    ["Marcos Viana (fictício)", "owner"],
    ["Condomínio Solar", "company"],
    ["Beatriz Rocha (fictícia)", "owner"],
  ],
};

const CODE_PREFIX: Record<BusinessSegment, string> = {
  legal: "PROC",
  accounting: "OBR",
  engineering: "PRJ",
  health: "AUT",
  real_estate: "IMV",
  consulting_services: "PRJ",
  other: "DEM",
};

/** Chave de dados por área ("consulting" atende consultoria e outros segmentos). */
export function demoDataKey(area: BusinessSegment) {
  return area === "consulting_services" || area === "other" ? "consulting" : area;
}

/** Datas fixas: a demo nunca depende do relógio nem de dados externos. */
const DATES = ["2026-10-12", "2026-10-16", "2026-10-21", "2026-10-28", "2026-11-04"];

export function buildDemoData(area: BusinessSegment): DemoData {
  const key = demoDataKey(area);
  const names = RECORD_NAMES[area] ?? RECORD_NAMES.default;
  const statuses: DemoStatus[] = ["active", "active", "pending", "active", "review"];
  const records: DemoRecord[] = names.map(([name, kind], i) => ({
    id: `r${i + 1}`,
    name,
    kind,
    status: statuses[i],
    owner: TEAM[i % TEAM.length],
    city: ["São Paulo", "Curitiba", "Recife", "Belo Horizonte", "Porto Alegre"][i],
  }));
  const caseStatus: DemoStatus[] = ["late", "active", "review", "pending"];
  const cases: DemoCase[] = [1, 2, 3, 4].map((n, i) => ({
    id: `c${n}`,
    code: `${CODE_PREFIX[area]}-2026-${String(40 + n).padStart(4, "0")}`,
    titleKey: `demo.data.${key}.cases.c${n}`,
    recordId: records[i].id,
    status: caseStatus[i],
    stage: [1, 2, 3, 0][i],
    due: DATES[i],
    amount: area === "real_estate" ? [420000, 780000, 2900, 1650000][i] : [8500, 3200, 12400, 5600][i],
  }));
  const tasks: DemoTask[] = [1, 2, 3, 4].map((n, i) => ({
    id: `t${n}`,
    titleKey: `demo.data.${key}.tasks.t${n}`,
    due: DATES[i],
    priority: (["high", "high", "medium", "low"] as const)[i],
    done: false,
    owner: TEAM[i],
  }));
  const finance: DemoFinance[] = [
    { id: "f1", descKey: "demo.data.finance.f1", type: "income", amount: 18400, due: DATES[0], status: "paid" },
    { id: "f2", descKey: "demo.data.finance.f2", type: "expense", amount: 690, due: DATES[1], status: "pending" },
    { id: "f3", descKey: "demo.data.finance.f3", type: "income", amount: 6250, due: DATES[2], status: "open" },
    { id: "f4", descKey: "demo.data.finance.f4", type: "expense", amount: 3120, due: DATES[0], status: "late" },
  ];
  const scheduleKey = area === "health" || area === "real_estate" ? area : null;
  const schedule: DemoSchedule[] = scheduleKey
    ? [1, 2, 3, 4].map((n, i) => ({
        id: `s${n}`,
        date: `${DATES[i + 1]}T${["09:00", "10:30", "14:00", "16:15"][i]}:00`,
        typeKey: `demo.data.${scheduleKey}.schedule.s${n}`,
        recordId: records[i].id,
      }))
    : [];
  const documents: DemoDocument[] = [1, 2, 3, 4].map((n, i) => ({
    id: `d${n}`,
    nameKey: `demo.data.documents.d${n}`,
    recordId: records[i].id,
    status: (["valid", "expiring", "pending", "valid"] as const)[i],
    expires: DATES[i + 1],
  }));
  return { records, cases, tasks, finance, schedule, documents };
}
