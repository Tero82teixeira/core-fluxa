export type RealEstateAlertSearch = {
  pendencia?: "proposta" | "contrato" | "repasse";
  busca?: string;
};

export function realEstateAlertSearch(search: Record<string, unknown>): RealEstateAlertSearch {
  const pendencia = search.pendencia;
  if (pendencia !== "proposta" && pendencia !== "contrato" && pendencia !== "repasse") return {};
  return {
    pendencia,
    busca:
      typeof search.busca === "string" && /^[A-Z0-9_-]{1,30}$/.test(search.busca)
        ? search.busca
        : undefined,
  };
}
