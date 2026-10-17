import { catalogPhone } from "./real-estate-catalog.ts";
export const INQUIRY_STATUSES = {
  novo: "Aguardando atendimento",
  em_contato: "Em atendimento",
  encerrado: "Encerrado",
} as const;
export type Inquiry = {
  id: string;
  property_id: string;
  property_code: string;
  property_title: string;
  name: string;
  phone: string;
  purpose: "venda" | "locacao";
  kind: "informacao" | "visita";
  preferred_day: string | null;
  preferred_period: string | null;
  message: string;
  status: keyof typeof INQUIRY_STATUSES;
  responsible_user_id: string | null;
  responsible_name: string | null;
  interest_id: string | null;
  client_name: string | null;
  visit_id: string | null;
  internal_note: string;
  version: number;
  created_at: string;
};
export type AgendaVisit = {
  id: string;
  property_id: string;
  property_code: string;
  property_title: string;
  client_name: string;
  responsible_name: string | null;
  responsible_user_id: string;
  starts_at: string;
  ends_at: string;
  status: "agendada" | "realizada" | "cancelada" | "nao_compareceu";
  version: number;
  confirmed_at: string | null;
  outcome: string | null;
};
export type InquiryForm = {
  name: string;
  phone: string;
  purpose: string;
  kind: string;
  preferred_day: string;
  preferred_period: string;
  message: string;
  consent: boolean;
  website: string;
};
export function inquiryValues(form: InquiryForm) {
  let phone: string;
  try {
    phone = catalogPhone(form.phone);
  } catch {
    throw new Error("INQUIRY_INVALID");
  }
  if (
    form.name.trim().length < 2 ||
    form.name.trim().length > 120 ||
    !phone ||
    form.message.length > 500 ||
    !form.consent ||
    !["venda", "locacao"].includes(form.purpose) ||
    !["informacao", "visita"].includes(form.kind)
  )
    throw new Error("INQUIRY_INVALID");
  if (form.preferred_day && !/^\d{4}-\d{2}-\d{2}$/.test(form.preferred_day))
    throw new Error("INQUIRY_INVALID");
  return { ...form, name: form.name.trim(), phone, message: form.message.trim() };
}
export function inquiryError(error: unknown) {
  const e = error as { message?: string; code?: string };
  if (e?.message?.includes("INQUIRY_LIMIT"))
    return "O limite de solicitações foi atingido. Tente novamente mais tarde ou use o WhatsApp comercial.";
  if (e?.message?.includes("INQUIRY_UNAVAILABLE"))
    return "Este anúncio não está mais disponível para solicitações.";
  if (e?.message?.includes("CONFLICT"))
    return "O registro mudou. Atualize a lista e abra novamente.";
  if (e?.message?.includes("ALREADY_SCHEDULED"))
    return "Já existe uma visita para este pedido. Abra a agenda para reagendar.";
  if (e?.message?.includes("ALREADY_LINKED"))
    return "Este pedido já está vinculado a um interessado. Atualize a lista.";
  if (e?.message?.includes("INTEREST_CLOSED"))
    return "O interesse existente está encerrado. Revise o cadastro em Interessados e visitas.";
  if (e?.message?.includes("LINK_REQUIRED"))
    return "Vincule o pedido a um cliente antes de agendar.";
  if (e?.message?.includes("CLIENT_INVALID")) return "Selecione um cliente ativo desta empresa.";
  if (e?.message?.includes("INQUIRY_INVALID"))
    return "Confira nome, telefone com DDD, finalidade, preferência e autorização de contato.";
  if (e?.code === "42501") return "Seu perfil não permite esta operação.";
  return null;
}
