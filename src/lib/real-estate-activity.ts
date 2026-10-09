import { z } from "zod";
export const INTEREST_STATUSES = {
  novo: "Novo",
  em_contato: "Em contato",
  visitando: "Em visitas",
  encerrado: "Encerrado",
} as const;
export const VISIT_STATUSES = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  nao_compareceu: "Não compareceu",
} as const;
const note = z
  .string()
  .trim()
  .max(4000, "Use até 4000 caracteres.")
  .transform((v) => v || null);
export const interestSchema = z.object({
  property_id: z.string().uuid(),
  client_id: z.string().uuid("Selecione um cliente."),
  purpose: z.enum(["venda", "locacao"]),
  status: z.enum(["novo", "em_contato", "visitando", "encerrado"]),
  responsible_user_id: z
    .string()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
  notes: note,
});
// datetime-local is always interpreted in the operator's device timezone; the API receives UTC.
export function localVisitDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Informe data e horário válidos.");
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() < 2000 ||
    date.getFullYear() > 2100 ||
    toLocalVisitDate(date.toISOString()) !== value
  )
    throw new Error("Informe data e horário válidos.");
  return date.toISOString();
}
export function toLocalVisitDate(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export const visitSchema = z
  .object({
    property_id: z.string().uuid(),
    interest_id: z.string().uuid("Selecione um interessado."),
    responsible_user_id: z.string().uuid("Selecione um responsável."),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    status: z.enum(["agendada", "realizada", "cancelada", "nao_compareceu"]),
    notes: note,
    outcome: note,
  })
  .superRefine((v, ctx) => {
    const minutes = (Date.parse(v.ends_at) - Date.parse(v.starts_at)) / 60000;
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 240)
      ctx.addIssue({ code: "custom", message: "A visita deve durar entre 15 minutos e 4 horas." });
    if (v.status !== "agendada" && !v.outcome)
      ctx.addIssue({
        code: "custom",
        message: "Registre o resultado ou motivo ao finalizar a visita.",
      });
  });
export type InterestValues = z.output<typeof interestSchema>;
export type VisitValues = z.output<typeof visitSchema>;
export type InterestRow = InterestValues & {
  id: string;
  version: number;
  client_name: string | null;
  responsible_name: string | null;
};
export type VisitRow = VisitValues & {
  id: string;
  version: number;
  client_id: string;
  client_name: string | null;
  responsible_name: string | null;
};
export function activityError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "23505")
    return "Esse cliente já tem interesse nessa finalidade para este imóvel. Edite o cadastro existente.";
  if (e?.message?.includes("CONFLICT"))
    return "Este registro mudou. Atualize a lista e abra novamente antes de salvar.";
  if (e?.message?.includes("VISIT_OVERLAP"))
    return "O responsável já tem uma visita agendada nesse horário. Escolha outro horário ou responsável.";
  if (e?.message?.includes("VISIT_FUTURE"))
    return "Escolha um horário futuro para agendar ou reagendar.";
  if (e?.message?.includes("VISIT_NOT_STARTED"))
    return "A visita ainda não começou. Aguarde o horário ou registre um cancelamento.";
  if (e?.message?.includes("PROPERTY_CLOSED"))
    return "Este imóvel ou interesse não está disponível para novos agendamentos.";
  if (e?.message?.includes("IMMUTABLE"))
    return "O cliente, a finalidade e o imóvel não podem ser trocados. Crie outro registro.";
  if (e?.message?.includes("RESPONSIBLE_INVALID"))
    return "Selecione um responsável ativo com acesso à operação imobiliária.";
  if (e?.code === "42501")
    return "Seu perfil ou a configuração da empresa não permite esta operação.";
  if (["23514", "23503", "23502", "22023"].includes(e?.code || ""))
    return "Confira os campos e escolha vínculos válidos da mesma empresa.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}
