export const REAL_ESTATE_SECTIONS = [
  "pendencias",
  "agenda",
  "atendimentos",
  "negociacoes",
  "contratos",
  "repasses",
] as const;
export type RealEstateSection = (typeof REAL_ESTATE_SECTIONS)[number];
export function realEstateSection(value: unknown): RealEstateSection | undefined {
  return typeof value === "string" && (REAL_ESTATE_SECTIONS as readonly string[]).includes(value)
    ? (value as RealEstateSection)
    : undefined;
}
export const REAL_ESTATE_SECTION_INFO = {
  pendencias: {
    title: "Visão do dia",
    description: "Visitas, retornos e pendências da imobiliária em um só lugar.",
    kind: "",
    scope: "pendencias",
  },
  agenda: {
    title: "Agenda",
    description: "Suas visitas e retornos por dia.",
    kind: "",
    scope: "pendencias",
  },
  atendimentos: {
    title: "Atendimentos",
    description: "Interessados, preferências, próximos contatos e visitas.",
    kind: "",
    scope: "pendencias",
  },
  negociacoes: {
    title: "Negociações",
    description: "Propostas de venda e locação vinculadas ao imóvel e ao interessado.",
    kind: "proposta",
    scope: "todos",
  },
  contratos: {
    title: "Contratos",
    description: "Contratos de venda e locação, vigências e vencimentos.",
    kind: "contrato",
    scope: "todos",
  },
  repasses: {
    title: "Comissões e repasses",
    description: "Demonstrativos, recebimentos e repasses aos proprietários.",
    kind: "repasse",
    scope: "todos",
  },
} as const;
export function currentRealEstateSection(search: { secao?: unknown; pendencia?: unknown }) {
  return search.pendencia === "proposta" ||
    search.pendencia === "contrato" ||
    search.pendencia === "repasse"
    ? "pendencias"
    : (realEstateSection(search.secao) ?? "imoveis");
}
export function realEstateItemActive(
  item: { to: string; search?: { secao?: string } },
  pathname: string,
  search: { secao?: unknown; pendencia?: unknown },
) {
  if (pathname !== item.to && !pathname.startsWith(`${item.to}/`)) return false;
  return (
    item.to !== "/imobiliaria/imoveis" ||
    (item.search?.secao ?? "imoveis") === currentRealEstateSection(search)
  );
}
export function realEstateOverviewStart(search: {
  secao?: unknown;
  pendencia?: "proposta" | "contrato" | "repasse";
  busca?: string;
}): { search: string; kind: string; scope: string; page: number } {
  if (search.pendencia)
    return { search: search.busca || "", kind: search.pendencia, scope: "pendencias", page: 1 };
  const section = realEstateSection(search.secao);
  const info = section ? REAL_ESTATE_SECTION_INFO[section] : null;
  return { search: "", kind: info?.kind ?? "", scope: info?.scope ?? "pendencias", page: 1 };
}
