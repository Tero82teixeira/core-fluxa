import { parsePropertyDecimal } from "./real-estate.ts";
import { proposalToday } from "./real-estate-proposals.ts";
export const CONTRACT_STATUSES = {
  ativo: "Em acompanhamento",
  futuro: "Início futuro",
  a_vencer: "Vence em até 30 dias",
  vencido: "Prazo vencido",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
} as const;
export const CONTRACT_ACTIONS = {
  criado: "Registro",
  renovado: "Renovação",
  encerrado: "Encerramento",
  cancelado: "Cancelamento",
} as const;
export type ContractAction = keyof typeof CONTRACT_ACTIONS;
export type ContractValues = {
  reference: string;
  action: ContractAction;
  amount: number;
  terms: string;
  starts_on: string;
  ends_on: string | null;
  note: string;
};
export type ContractOption = {
  id: string;
  client_name: string | null;
  purpose: "venda" | "locacao";
  amount: number;
  terms: string;
};
export type ContractRow = Omit<ContractValues, "action"> & {
  id: string;
  proposal_id: string;
  property_id: string;
  property_code: string;
  property_title: string;
  client_name: string | null;
  purpose: "venda" | "locacao";
  version: number;
  status: "ativo" | "encerrado" | "cancelado";
  display_status: keyof typeof CONTRACT_STATUSES;
  updated_at: string;
};
export type ContractEvent = Omit<ContractValues, "reference"> & {
  id: string;
  version: number;
  status: ContractRow["status"];
  actor_name: string | null;
  created_at: string;
};
export type ContractForm = {
  reference: string;
  amount: string;
  terms: string;
  starts_on: string;
  ends_on: string;
  note: string;
};
function dateValid(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === value &&
    value >= "2000-01-01" &&
    value <= "2100-12-31"
  );
}
export function contractValues(
  form: ContractForm,
  action: ContractAction,
  purpose: "venda" | "locacao",
  previous?: ContractRow,
): ContractValues {
  const amount = parsePropertyDecimal(form.amount);
  if (amount === null)
    throw new Error("Informe um valor positivo, com até duas casas decimais. Exemplo: 1500,00.");
  const reference = form.reference.trim(),
    terms = form.terms.trim(),
    note = form.note.trim();
  if (!reference || reference.length > 60)
    throw new Error("Informe a referência do contrato com até 60 caracteres.");
  if (!terms || terms.length > 4000 || !note || note.length > 4000)
    throw new Error("Informe condições e confirmação ou motivo, com até 4000 caracteres.");
  if (
    !dateValid(form.starts_on) ||
    (form.ends_on && !dateValid(form.ends_on)) ||
    (form.ends_on && form.ends_on < form.starts_on)
  )
    throw new Error("Confira as datas: o término deve ser igual ou posterior ao início.");
  if (purpose === "locacao" && !form.ends_on) throw new Error("Informe o término da locação.");
  if (
    action === "renovado" &&
    (purpose !== "locacao" ||
      !previous?.ends_on ||
      form.starts_on !== previous.starts_on ||
      form.ends_on <= previous.ends_on ||
      form.ends_on < proposalToday())
  )
    throw new Error(
      "Na renovação, mantenha o início e informe um término futuro posterior ao atual.",
    );
  return {
    reference,
    action,
    amount,
    terms,
    starts_on: form.starts_on,
    ends_on: form.ends_on || null,
    note,
  };
}
export function contractError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.message?.includes("CONFLICT"))
    return "O contrato mudou. Atualize a lista e abra novamente.";
  if (e?.message?.includes("ACTIVE_PROPOSAL"))
    return "Encerre ou cancele o contrato antes de cancelar a proposta vinculada.";
  if (e?.message?.includes("ACCEPTED"))
    return "Selecione uma proposta aceita e preserve seu valor e condições para criar o contrato.";
  if (e?.message?.includes("ALREADY_ACTIVE"))
    return "Já existe contrato em acompanhamento para esta finalidade do imóvel. Encerre o anterior antes de registrar outro.";
  if (e?.message?.includes("RENEWAL"))
    return "Somente locações podem ser renovadas. Informe um término futuro posterior ao atual.";
  if (e?.message?.includes("PROPERTY_CLOSED"))
    return "O imóvel ou interessado está indisponível para registrar o contrato.";
  if (e?.code === "23505") return "A referência ou proposta já possui contrato registrado.";
  if (e?.code === "42501") return "Seu perfil ou empresa não permite esta operação.";
  if (["23514", "23503", "23502", "22023", "22P02", "22007"].includes(e?.code || ""))
    return "Confira os campos e a situação atual do contrato.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}
