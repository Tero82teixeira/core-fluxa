import { mobileClientName } from "./real-estate-mobile.ts";
import { normalizeVoice, parseVoiceCriteria, type VoiceCriteria } from "./real-estate-voice.ts";
import { catalogUrl, type CatalogListing } from "./real-estate-catalog.ts";
export const emptyMobileFilters = (): VoiceCriteria => ({
  search: "",
  type: "",
  purpose: "",
  maxPrice: null,
});
export type MobileCommand =
  | { kind: "agenda" }
  | { kind: "client"; name: string }
  | { kind: "properties"; filters: VoiceCriteria };
export function mobileCommand(text: string): MobileCommand {
  const normalized = normalizeVoice(text)
    .replace(/[?!¿¡.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Nomes explícitos de clientes têm precedência sobre palavras da agenda/imóveis.
  if (
    /^(?:(?:buscar|busque|procurar|procure|find|search for)\s+)?(?:(?:o|a)\s+)?(?:cliente|client|customer|contato)\s+/.test(
      normalized,
    )
  )
    return { kind: "client", name: mobileClientName(text) };
  const agenda =
    /^(?:(?:minha|my|mi)\s+)?(?:agenda|visitas|retornos|atendimentos|schedule|visits|follow ups|citas)(?:\s+(?:de|para|for))?\s+(?:hoje|today|hoy)$/.test(
      normalized,
    ) ||
    /^(?:quem (?:eu )?(?:preciso|devo|tenho que) atender hoje|who (?:do i need to|should i) (?:contact|see) today|a quien (?:debo|tengo que) atender hoy)$/.test(
      normalized,
    );
  if (agenda) return { kind: "agenda" };
  if (
    /\b(?:imoveis|imovel|propriedades|properties|property|apartamentos?|apartments?|pisos?|casas?|houses?|terrenos?|comercial|rural|alugar|locacao|comprar|venda|alquilar|alquiler|venta|rent|rental|buy|sale)\b/.test(
      normalized,
    )
  ) {
    const input = text.replace(
      /\b(?:imóveis|imovel|imóvel|imoveis|propriedades|properties|property)\b/gi,
      "",
    );
    return { kind: "properties", filters: parseVoiceCriteria(input) };
  }
  return { kind: "client", name: mobileClientName(text) };
}
export function needsMobilePurpose(filters: VoiceCriteria) {
  return filters.maxPrice !== null && !["venda", "locacao"].includes(filters.purpose);
}
export type MobilePreview = {
  property_id: string;
  code: string;
  token: string | null;
  listing: CatalogListing | null;
};
export function selectionCatalog(items: MobilePreview[]) {
  if (
    !items.length ||
    items.length > 20 ||
    new Set(items.map((i) => i.property_id)).size !== items.length
  )
    throw new Error("MOBILE_SELECTION_INVALID");
  const token = items[0].token;
  if (!token || items.some((i) => i.token !== token || !i.listing))
    throw new Error("MOBILE_SELECTION_UNAVAILABLE");
  const ids = items.map((i) => i.listing!.id);
  if (new Set(ids).size !== ids.length) throw new Error("MOBILE_SELECTION_INVALID");
  return { token, ids };
}
export function verifySelectionIds(ids: string[], published: string[]) {
  if (ids.length !== published.length || ids.some((id) => !published.includes(id)))
    throw new Error("MOBILE_SELECTION_UNAVAILABLE");
}
export function publicMobileSelection(origin: string, items: MobilePreview[], published: string[]) {
  const { token, ids } = selectionCatalog(items);
  verifySelectionIds(ids, published);
  return catalogUrl(origin, token, ids);
}
export async function mapMobileSelection<T>(ids: string[], load: (id: string) => Promise<T>) {
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length)
    throw new Error("MOBILE_SELECTION_INVALID");
  const result: T[] = new Array(ids.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(ids.length, 4) }, async () => {
      while (next < ids.length) {
        const index = next++;
        result[index] = await load(ids[index]);
      }
    }),
  );
  return result;
}
type ShareApi = {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};
export async function shareMobileLink(
  url: string,
  text: string,
  api: ShareApi,
): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  if (api.share) {
    try {
      await api.share({ title: "FLUXA", text, url });
      return "shared";
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return "cancelled";
    }
  }
  try {
    if (api.clipboard) {
      await api.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    /* O link continua selecionável para cópia manual. */
  }
  return "manual";
}
