export const FOLLOWUP_FILTERS = {
  overdue: "Retornos vencidos",
  today: "Retornos de hoje",
  future: "Retornos futuros",
  none: "Sem retorno definido",
} as const;
export const CONTACT_CHANNELS = {
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  email: "E-mail",
  presencial: "Presencial",
  outro: "Outro",
} as const;
export function followupState(
  value: string | null | undefined,
  now = new Date(),
): "none" | "overdue" | "today" | "future" {
  if (!value) return "none";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "none";
  if (date.getTime() < now.getTime()) return "overdue";
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
    ? "today"
    : "future";
}
export function followupError(error: unknown): string | null {
  const e = error as { message?: string };
  if (e?.message?.includes("FOLLOWUP_FUTURE_REQUIRED"))
    return "Escolha um horário futuro para o retorno. Pedidos encerrados não recebem novos retornos.";
  return null;
}
export type HistoryEvent = {
  kind: "pedido" | "interesse" | "visita" | "proposta" | "contato" | "retorno";
  id: string;
  property_code: string;
  property_title: string;
  happened_at: string;
  status: string;
  note: string | null;
  amount: number | null;
  next_contact_at: string | null;
};
export type ContactHistory = {
  client_name: string | null;
  linked: boolean;
  items: HistoryEvent[];
  total: number;
};
