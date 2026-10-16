export const CATALOG_BUCKET = "real-estate-photos";
export const MAX_CATALOG_PHOTOS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCatalogId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);
export type CatalogPhoto = { id: string; path: string; caption: string; url?: string };
export type CatalogListing = {
  id: string;
  title: string;
  description: string;
  code: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  features: string;
  property_type: string;
  purpose: string;
  sale_price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  district: string | null;
  city: string;
  state: string;
  photos: CatalogPhoto[];
};
export type ManagedListing = CatalogListing & {
  property_id: string;
  is_published: boolean;
  visible: boolean;
};
export type CatalogStore = {
  token: string;
  company_name: string;
  whatsapp: string;
  is_enabled: boolean;
  updated_at: string;
};
export type CatalogForm = {
  title: string;
  description: string;
  bedrooms: string;
  bathrooms: string;
  parking: string;
  features: string;
  is_published: boolean;
};
export type CatalogSource = Omit<
  CatalogListing,
  "id" | "description" | "bedrooms" | "bathrooms" | "parking" | "features" | "photos"
> & { id: string; status: string };
export type ManagedCatalog = {
  store: CatalogStore | null;
  source: CatalogSource | null;
  listing: ManagedListing | null;
  items: ManagedListing[];
  total: number;
  removed_path: string | null;
};
export type PublicCatalog = {
  company_name: string;
  whatsapp: string;
  items: CatalogListing[];
  total: number;
};

export function catalogForm(source: CatalogSource | CatalogListing): CatalogForm {
  return {
    title: source.title,
    description: "description" in source ? source.description : "",
    features: "features" in source ? source.features : "",
    bedrooms: "bedrooms" in source ? String(source.bedrooms ?? "") : "",
    bathrooms: "bathrooms" in source ? String(source.bathrooms ?? "") : "",
    parking: "parking" in source ? String(source.parking ?? "") : "",
    is_published: "is_published" in source ? Boolean(source.is_published) : false,
  };
}
export function catalogValues(form: CatalogForm) {
  const number = (value: string) => {
    if (!value.trim()) return null;
    if (!/^\d{1,2}$/.test(value.trim()))
      throw new Error("Quartos, banheiros e vagas devem ser números inteiros de 0 a 99.");
    return Number(value);
  };
  if (
    !form.title.trim() ||
    form.title.length > 160 ||
    form.description.length > 4000 ||
    form.features.length > 1000
  )
    throw new Error("Revise o título e os limites da descrição e dos diferenciais.");
  return {
    ...form,
    title: form.title.trim(),
    bedrooms: number(form.bedrooms),
    bathrooms: number(form.bathrooms),
    parking: number(form.parking),
  };
}
export function catalogPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (!/^55[1-9][0-9]{9,10}$/.test(digits))
    throw new Error("Informe o WhatsApp da imobiliária com DDD. Exemplo: 27 99999-9999.");
  return digits;
}
export function parseCatalogSelection(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const ids = value.split(",");
  if (!ids.length || ids.length > 20 || ids.some((id) => !isCatalogId(id))) return null;
  return [...new Set(ids)];
}
export function catalogUrl(origin: string, token: string, ids: readonly string[] = []): string {
  if (!isCatalogId(token) || ids.length > 20 || ids.some((id) => !isCatalogId(id)))
    throw new Error("Seleção inválida. Escolha até 20 anúncios publicados.");
  const url = new URL(`/imoveis/${token}`, origin);
  if (ids.length) url.searchParams.set("imoveis", [...new Set(ids)].join(","));
  return url.href;
}
export function propertyWhatsapp(
  phone: string,
  listing: Pick<CatalogListing, "code" | "title">,
  url: string,
  visit = false,
) {
  const digits = catalogPhone(phone);
  const text = `Olá! ${visit ? "Gostaria de agendar uma visita ao" : "Quero mais informações sobre o"} imóvel ${listing.code} — ${listing.title}.\n${url}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export function catalogError(error: unknown): string {
  const text = (error as { message?: string })?.message || "";
  for (const [code, message] of [
    [
      "PHOTO_DESCRIPTION_REQUIRED",
      "Adicione pelo menos uma foto e uma descrição com 10 ou mais caracteres antes de publicar.",
    ],
    [
      "STOREFRONT_DISABLED",
      "Configure e ative a vitrine da imobiliária antes de publicar o anúncio.",
    ],
    [
      "PROPERTY_UNAVAILABLE",
      "Este imóvel está indisponível. Desmarque a publicação ou atualize sua situação no cadastro.",
    ],
    ["PHOTO_LIMIT", "O limite é de 20 fotos por imóvel."],
    ["DRAFT_REQUIRED", "Salve o rascunho antes de adicionar fotos."],
    ["DENIED", "Seu perfil não tem acesso a esta operação."],
  ])
    if (text.includes(code)) return message;
  return "Não foi possível concluir a operação. Atualize a página e tente novamente.";
}

/** Reduz a foto e reencoda os pixels: nomes originais e EXIF não seguem para a vitrine. */
export async function prepareCatalogPhoto(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error("Escolha uma foto JPG, PNG ou WebP de até 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto neste navegador.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob || blob.type !== "image/webp" || blob.size > 5 * 1024 * 1024)
      throw new Error("Não foi possível preparar esta foto. Escolha outra imagem.");
    return blob;
  } finally {
    bitmap.close();
  }
}
