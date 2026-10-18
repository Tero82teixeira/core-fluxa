import type { MobilePreview } from "./real-estate-mobile-actions.ts";
import type { VoiceCriteria } from "./real-estate-voice.ts";
import { normalizeVoice, parseVoiceCriteria } from "./real-estate-voice.ts";
export type MobileClient = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  status: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  owner_name?: string | null;
};
export type MobileEntry = {
  id: string;
  kind: "interest" | "visit" | "proposal" | "contract" | "preference" | "return";
  title: string;
  location?: string | null;
  status: string;
  display_status?: string | null;
  purpose?: string;
  amount?: number | null;
  at: string;
  detail?: string | null;
};
export type MobileToday = {
  id: string;
  kind: "visit" | "return";
  title: string;
  at: string;
  client_id: string | null;
};
export type MobilePage<T> = { items: T[]; total: number };
export type MobileSummary = MobilePage<MobileEntry> & { client: MobileClient };
export type MobileProperty = {
  id: string;
  code: string;
  title: string;
  district: string | null;
  city: string;
  state: string;
  purpose: string;
  status: string;
  sale_price: number | null;
  rent_price: number | null;
};
export type MobileSource = {
  preview: (ids: string[]) => Promise<MobilePreview[]>;
  share: (ids: string[], origin: string) => Promise<string>;
  properties: (filters: VoiceCriteria, page: number) => Promise<MobilePage<MobileProperty>>;
  scope: string;
  search: (search: string, page: number) => Promise<MobilePage<MobileClient>>;
  client: (id: string, page: number) => Promise<MobileSummary>;
  today: (start: string, end: string, page: number) => Promise<MobilePage<MobileToday>>;
};
export function mobileClientName(value: string) {
  return parseVoiceCriteria(value.trim().replace(/[.!?]+$/, ""), "contact").search;
}
export function mobileDay(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
export function mobileContact(value?: string | null) {
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^55\d{10,11}$/.test(number) ? number : null;
}
export function mobileMatches(name: string, search: string) {
  return normalizeVoice(name).includes(normalizeVoice(search));
}

export function uniqueMobileClient(result: MobilePage<MobileClient>, page: number) {
  return page === 1 && result.total === 1 && result.items.length === 1 ? result.items[0].id : null;
}
