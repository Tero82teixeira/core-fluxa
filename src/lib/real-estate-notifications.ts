import { realEstateSection, type RealEstateSection } from "./real-estate-workspace.ts";
export type RealEstateAlertSearch = {
  secao?: RealEstateSection;
  localizar?: string;
  pendencia?: "proposta" | "contrato" | "repasse";
  busca?: string;
};

export function realEstateAlertSearch(search: Record<string, unknown>): RealEstateAlertSearch {
  const pendencia = search.pendencia;
  const secao = realEstateSection(search.secao);
  const localizar =
    typeof search.localizar === "string" && /^[A-Z0-9_-]{1,30}$/.test(search.localizar)
      ? search.localizar
      : undefined;
  if (pendencia !== "proposta" && pendencia !== "contrato" && pendencia !== "repasse")
    return { ...(secao ? { secao } : {}), ...(localizar ? { localizar } : {}) };
  return {
    ...(secao ? { secao } : {}),
    pendencia,
    busca:
      typeof search.busca === "string" && /^[A-Z0-9_-]{1,30}$/.test(search.busca)
        ? search.busca
        : undefined,
  };
}
