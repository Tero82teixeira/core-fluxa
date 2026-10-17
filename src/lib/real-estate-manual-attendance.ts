import { catalogPhone } from "./real-estate-catalog.ts";
import { validatePreferences, type PropertyPreferences } from "./real-estate-preferences.ts";
export const INQUIRY_ORIGINS = {
  vitrine: "Vitrine pública",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  presencial: "Presencial",
  outro: "Outro canal",
} as const;
export const CLOSURE_REASONS = {
  fechou_negocio: "Fechou negócio",
  desistiu: "Desistiu",
  sem_imovel: "Sem imóvel adequado",
  outro: "Outro motivo",
} as const;
export type ManualAttendanceValues = {
  name: string;
  phone: string;
  origin: Exclude<keyof typeof INQUIRY_ORIGINS, "vitrine">;
  responsible_user_id: string;
  next_contact_at: string | null;
  internal_note: string;
  preferences: PropertyPreferences;
};
export function validateManualAttendance(
  v: ManualAttendanceValues,
  now = Date.now(),
): ManualAttendanceValues {
  if (
    v.name.trim().length < 2 ||
    v.name.trim().length > 120 ||
    !["whatsapp", "telefone", "presencial", "outro"].includes(v.origin) ||
    v.internal_note.length > 2000 ||
    (v.next_contact_at !== null &&
      (!Number.isFinite(Date.parse(v.next_contact_at)) ||
        Date.parse(v.next_contact_at) <= now ||
        Date.parse(v.next_contact_at) > now + 732 * 86400000))
  )
    throw new Error("MANUAL_INVALID");
  return {
    ...v,
    name: v.name.trim(),
    phone: catalogPhone(v.phone),
    internal_note: v.internal_note.trim(),
    preferences: validatePreferences(v.preferences),
  };
}
export function validClosure(reason: string, note: string) {
  return (
    Object.hasOwn(CLOSURE_REASONS, reason) &&
    note.trim().length <= 1500 &&
    (reason !== "outro" || note.trim().length >= 2)
  );
}
export function manualAttendanceError(e: unknown) {
  if ((e as { code?: string })?.code === "23505")
    return "Já existe um atendimento ativo deste contato para a mesma finalidade e imóvel. Localize o registro existente na fila.";
  const msg = (e as { message?: string })?.message || "";
  if (msg.includes("CLOSURE_REQUIRED"))
    return "Escolha o motivo do encerramento e detalhe quando selecionar Outro motivo.";
  if (msg.includes("DUPLICATE_PROPERTY"))
    return "Já existe atendimento ativo deste contato para esse imóvel. Localize o atendimento existente na fila.";
  if (msg.includes("PROPERTY_REQUIRED"))
    return "Vincule um imóvel ao atendimento antes de vincular o cliente e agendar.";
  if (msg.includes("PROPERTY_INVALID"))
    return "Escolha um imóvel disponível ou reservado, da mesma finalidade e empresa.";
  if (msg.includes("FUTURE_REQUIRED"))
    return "Informe um próximo retorno futuro, dentro de dois anos.";
  return "";
}
