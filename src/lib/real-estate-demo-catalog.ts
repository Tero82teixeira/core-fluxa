/** Catálogo ilustrativo independente do banco e dos cadastros reais. */
export type DemoListing = {
  id: string;
  kind: "house" | "apartment";
  purpose: "venda" | "locacao";
  amount: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  district: string;
  published: boolean;
  title: string;
  description: string;
  photos: string[];
};
export function buildDemoCatalog(): DemoListing[] {
  const examples: Omit<DemoListing, "published" | "title" | "description">[] = [
    {
      id: "IMOV-001",
      kind: "house",
      purpose: "locacao",
      amount: 2100,
      area: 120,
      bedrooms: 3,
      bathrooms: 2,
      parking: 2,
      district: "Jardins",
      photos: ["casa", "sala"],
    },
    {
      id: "IMOV-002",
      kind: "apartment",
      purpose: "locacao",
      amount: 1600,
      area: 68,
      bedrooms: 2,
      bathrooms: 1,
      parking: 1,
      district: "Centro",
      photos: ["sala", "cozinha"],
    },
    {
      id: "IMOV-004",
      kind: "house",
      purpose: "venda",
      amount: 650000,
      area: 160,
      bedrooms: 3,
      bathrooms: 3,
      parking: 2,
      district: "Jardins",
      photos: ["fachada", "cozinha"],
    },
    {
      id: "IMOV-005",
      kind: "apartment",
      purpose: "venda",
      amount: 390000,
      area: 82,
      bedrooms: 2,
      bathrooms: 2,
      parking: 1,
      district: "Centro",
      photos: ["sala", "cozinha"],
    },
  ];
  return examples.map((p) => ({
    ...p,
    published: true,
    title: "",
    description: "",
    photos: p.photos.map((photo) => `/demo/imoveis/${photo}.webp`),
  }));
}
export function demoCatalogSelection(value: string | undefined): string[] | null {
  if (value === undefined || value === "all") return buildDemoCatalog().map((p) => p.id);
  if (!value || value.length > 200) return null;
  const ids = [...new Set(value.split(","))];
  const known = new Set(buildDemoCatalog().map((p) => p.id));
  return ids.length && ids.every((id) => known.has(id)) ? ids : null;
}
export function demoCatalogUrl(origin: string, ids: string[]) {
  const valid = demoCatalogSelection(ids.join(","));
  if (!valid) return null;
  return `${origin}/demo?area=real_estate&catalogo=${encodeURIComponent(valid.join(","))}`;
}
export function filterDemoCatalog(
  items: DemoListing[],
  purpose: string,
  kind: string,
  max: number | null,
  search: string,
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return items.filter(
    (p) =>
      p.published &&
      (!purpose || p.purpose === purpose) &&
      (!kind || p.kind === kind) &&
      (max === null || p.amount <= max) &&
      normalize(`${p.id} ${p.title} ${p.district} Anchieta ES`).includes(normalize(search.trim())),
  );
}
