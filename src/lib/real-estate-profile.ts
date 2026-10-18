import { catalogPhone } from "./real-estate-catalog.ts";
export const BRANDING_BUCKET = "real-estate-branding";
export type PublicBusinessProfile = Omit<BusinessProfile, "version">;
export type BusinessProfile = {
  agent_name: string;
  agent_creci: string;
  company_creci: string;
  bio: string;
  logo_path: string | null;
  agent_photo_path: string | null;
  version: number;
  logo_url?: string;
  agent_photo_url?: string;
};
export const emptyBusinessProfile = (): BusinessProfile => ({
  agent_name: "",
  agent_creci: "",
  company_creci: "",
  bio: "",
  logo_path: null,
  agent_photo_path: null,
  version: 0,
});
export function profileValues(p: BusinessProfile) {
  const values = {
    agent_name: p.agent_name.trim(),
    agent_creci: p.agent_creci.trim(),
    company_creci: p.company_creci.trim(),
    bio: p.bio.trim(),
    logo_path: p.logo_path,
    agent_photo_path: p.agent_photo_path,
    version: p.version,
  };
  if (
    values.agent_name.length > 120 ||
    values.agent_creci.length > 40 ||
    values.company_creci.length > 40 ||
    values.bio.length > 500 ||
    !Number.isInteger(p.version) ||
    p.version < 0 ||
    Boolean(p.agent_photo_path && !values.agent_name)
  )
    throw new Error("BRANDING_INVALID");
  return values;
}
export function businessWhatsapp(phone: string, url: string) {
  return `https://wa.me/${catalogPhone(phone)}?text=${encodeURIComponent(`Olá! Gostaria de conversar sobre imóveis.\n${url}`)}`;
}
export function profileError(error: unknown) {
  const message = (error as { message?: string })?.message || "";
  return message.includes("CONFLICT")
    ? "conflict"
    : message.includes("DENIED")
      ? "denied"
      : message.includes("INVALID") || message.includes("NAME_REQUIRED")
        ? "invalid"
        : "failed";
}
