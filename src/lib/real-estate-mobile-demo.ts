import { buildDemoCatalog, demoCatalogUrl } from "./real-estate-demo-catalog.ts";
import {
  selectionCatalog,
  mapMobileSelection,
  verifySelectionIds,
  needsMobilePurpose,
  type MobilePreview,
} from "./real-estate-mobile-actions.ts";
import type { RealEstateDemo } from "./real-estate-public-demo";
import {
  mobileMatches,
  type MobileClient,
  type MobileEntry,
  type MobileSource,
} from "./real-estate-mobile.ts";
/** Os vínculos aqui são exclusivos do cenário fictício, nunca inferidos no banco real. */
export function buildMobileDemo(data: RealEstateDemo): MobileSource {
  const names = [
    ...new Set([...data.proposals.map((p) => p.interested), "Carlos Almeida", "Carlos Oliveira"]),
  ];
  const clients: MobileClient[] = names.map((name, index) => ({
    id: `mobile-demo-${index}`,
    name,
    city: "Anchieta",
    state: "ES",
    status: "ativo",
    owner_name: "Equipe Exemplo",
  }));
  const paginate = <T>(items: T[], page: number) => ({
    items: items.slice((page - 1) * 20, page * 20),
    total: items.length,
  });
  const catalog = buildDemoCatalog();
  const properties = [
    ...catalog.map((p) => ({
      id: p.id,
      code: p.id,
      title: p.kind,
      district: p.district,
      city: "Anchieta",
      state: "ES",
      property_type: p.kind === "house" ? "casa" : "apartamento",
      purpose: p.purpose,
      status: "disponivel",
      sale_price: p.purpose === "venda" ? p.amount : null,
      rent_price: p.purpose === "locacao" ? p.amount : null,
    })),
    ...data.properties
      .filter((p) => !catalog.some((c) => c.id === p.id))
      .map((p) => ({
        id: p.id,
        code: p.id,
        title: p.titleKey,
        district: "Centro",
        city: "Anchieta",
        state: "ES",
        property_type: "comercial",
        purpose: p.purpose,
        status: "disponivel",
        sale_price: p.purpose === "venda" ? p.amount : null,
        rent_price: p.purpose === "locacao" ? p.amount : null,
      })),
  ];
  async function preview(ids: string[]): Promise<MobilePreview[]> {
    return mapMobileSelection(ids, async (id) => {
      const p = catalog.find((p) => p.id === id && p.published);
      return {
        property_id: id,
        code: id,
        token: p ? "demo" : null,
        listing: p
          ? {
              id: p.id,
              code: p.id,
              title: p.kind,
              description: p.description,
              bedrooms: p.bedrooms,
              bathrooms: p.bathrooms,
              parking: p.parking,
              features: "",
              property_type: p.kind === "house" ? "casa" : "apartamento",
              purpose: p.purpose,
              sale_price: p.purpose === "venda" ? p.amount : null,
              rent_price: p.purpose === "locacao" ? p.amount : null,
              area_m2: p.area,
              district: p.district,
              city: "Anchieta",
              state: "ES",
              photos: p.photos.map((url, index) => ({
                id: `${p.id}-${index}`,
                path: url,
                url,
                caption: "",
              })),
            }
          : null,
      };
    });
  }
  return {
    scope: `demo-mobile:${JSON.stringify(data)}`,
    preview,
    share: async (ids, origin) => {
      const selection = selectionCatalog(await preview(ids));
      verifySelectionIds(
        selection.ids,
        catalog
          .filter((p) => p.published)
          .filter((p) => selection.ids.includes(p.id))
          .map((p) => p.id),
      );
      const url = demoCatalogUrl(origin, selection.ids);
      if (!url) throw new Error("MOBILE_SELECTION_UNAVAILABLE");
      return url;
    },
    properties: async (filters, page) => {
      if (needsMobilePurpose(filters)) throw new Error("MOBILE_PURPOSE_REQUIRED");
      return paginate(
        properties.filter(
          (p) =>
            (!filters.type || p.property_type === filters.type) &&
            (!filters.purpose || p.purpose === filters.purpose) &&
            (filters.maxPrice === null ||
              (filters.purpose === "locacao" ? p.rent_price : p.sale_price)! <= filters.maxPrice) &&
            mobileMatches(
              `${p.code} ${p.title} ${p.district} ${p.city} ${p.state}`,
              filters.search,
            ),
        ),
        page,
      );
    },
    search: async (search, page) =>
      paginate(
        clients.filter((c) => mobileMatches(c.name, search)),
        page,
      ),
    client: async (id, page) => {
      const client = clients.find((c) => c.id === id);
      if (!client) throw new Error("MOBILE_READ_DENIED");
      const proposals = data.proposals.filter((p) => p.interested === client.name);
      const items: MobileEntry[] = proposals.map((p) => ({
        id: p.id,
        kind: "proposal",
        title: p.property,
        location: "Centro · Anchieta/ES",
        status: p.status,
        purpose: data.properties.find((x) => x.id === p.property)?.purpose,
        amount: p.amount,
        at: "2026-10-16T15:00:00-03:00",
      }));
      for (const c of data.contracts) {
        if (!proposals.some((p) => p.id === c.proposal)) continue;
        const property = data.properties.find((p) => p.id === c.property);
        items.unshift({
          id: c.id,
          kind: "contract",
          title: `${c.id} · ${c.property}`,
          location: "Centro · Anchieta/ES",
          status: "ativo",
          purpose: property?.purpose,
          amount: c.amount,
          at: `${c.startsOn}T12:00:00-03:00`,
          detail: c.startsOn + (c.endsOn ? ` — ${c.endsOn}` : ""),
        });
      }
      if (client.name === "Carlos Almeida") {
        items.push(
          {
            id: "demo-interest",
            kind: "interest",
            title: "IMOV-002 · Apartamento",
            location: "Centro · Anchieta/ES",
            status: "em_contato",
            purpose: "locacao",
            amount: 1600,
            at: "2026-10-16T13:00:00-03:00",
          },
          {
            id: "demo-preference",
            kind: "preference",
            title: "apartamento",
            location: "Centro",
            status: "em_contato",
            purpose: "locacao",
            amount: 1800,
            at: "2026-10-16T13:00:00-03:00",
          },
          {
            id: "demo-visit",
            kind: "visit",
            title: "IMOV-002 · Apartamento",
            location: "Centro · Anchieta/ES",
            status: "agendada",
            purpose: "locacao",
            at: "2026-10-19T14:00:00-03:00",
          },
        );
      }
      return {
        client,
        ...paginate(
          items.sort((a, b) => b.at.localeCompare(a.at)),
          page,
        ),
      };
    },
    today: async (start, _end, page) => {
      const at = new Date(start);
      at.setHours(at.getHours() + 10);
      return paginate(
        [
          {
            id: "demo-return",
            kind: "return" as const,
            title: "Marina Costa",
            client_id: clients[0].id,
            at: at.toISOString(),
          },
        ],
        page,
      );
    },
  };
}
