import type { CatalogListing } from "./real-estate-catalog.ts";
export type PropertyPreferences = {
  purpose: "venda" | "locacao";
  property_type: string;
  districts: string[];
  max_price: number | null;
  bedrooms: number | null;
  parking: number | null;
};
export const emptyPreferences = (purpose: "venda" | "locacao" = "venda"): PropertyPreferences => ({
  purpose,
  property_type: "",
  districts: [],
  max_price: null,
  bedrooms: null,
  parking: null,
});
export const normalizeDistrict = (s: string) =>
  s
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function validatePreferences(p: PropertyPreferences): PropertyPreferences {
  if (
    !["venda", "locacao"].includes(p.purpose) ||
    !["", "casa", "apartamento", "terreno", "comercial", "rural", "outro"].includes(
      p.property_type,
    ) ||
    !Array.isArray(p.districts) ||
    p.districts.length > 10 ||
    p.districts.some((d) => typeof d !== "string" || !d.trim() || d.trim().length > 80) ||
    (p.max_price !== null &&
      (!Number.isFinite(p.max_price) || p.max_price <= 0 || p.max_price >= 1e12)) ||
    [p.bedrooms, p.parking].some((n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 99))
  )
    throw new Error("PREFERENCES_INVALID");
  return {
    ...p,
    districts: [...new Map(p.districts.map((d) => [normalizeDistrict(d), d.trim()])).values()],
  };
}
/** Mesmos critérios do RPC; dados ausentes não contam como compatíveis. */
export function preferenceIssues(
  p: PropertyPreferences,
  l: Pick<
    CatalogListing,
    "purpose" | "property_type" | "district" | "sale_price" | "rent_price" | "bedrooms" | "parking"
  >,
): string[] {
  const issues: string[] = [];
  if (l.purpose !== p.purpose && l.purpose !== "venda_locacao") issues.push("purpose");
  if (p.property_type && l.property_type !== p.property_type) issues.push("property_type");
  if (
    p.districts.length &&
    !p.districts.some((d) => normalizeDistrict(d) === normalizeDistrict(l.district || ""))
  )
    issues.push("districts");
  const price = p.purpose === "venda" ? l.sale_price : l.rent_price;
  if (p.max_price !== null && (price === null || price > p.max_price))
    issues.push(price === null ? "price_unknown" : "max_price");
  for (const key of ["bedrooms", "parking"] as const)
    if (p[key] !== null && (l[key] === null || l[key]! < p[key]!))
      issues.push(l[key] === null ? `${key}_unknown` : key);
  return issues;
}
export type PreferenceMatch = CatalogListing & { issues: string[] };
export type PreferenceResult = {
  preferences: PropertyPreferences | null;
  version: number;
  token: string | null;
  items: PreferenceMatch[];
  total: number;
};
export function preferencesError(error: unknown) {
  const message = (error as { message?: string })?.message || "";
  if (message.includes("CONFLICT")) return "conflict";
  if (message.includes("SELECTION")) return "selectionError";
  if (message.includes("INVALID")) return "invalid";
  return "error";
}
