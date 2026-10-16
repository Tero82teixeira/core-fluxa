import { parsePropertyDecimal } from "./real-estate.ts";
import { proposalToday } from "./real-estate-proposals.ts";
export const SETTLEMENT_STATUSES = {
  previsto: "Previsto",
  recebido: "Recebido / repasse pendente",
  repassado: "Repassado",
  cancelado: "Cancelado",
  atrasado: "Repasse em atraso",
} as const;
export const SETTLEMENT_ACTIONS = {
  criado: "Demonstrativo registrado",
  recebido: "Recebimento confirmado",
  repassado: "Repasse confirmado",
  cancelado: "Demonstrativo cancelado",
} as const;
export type SettlementAction = keyof typeof SETTLEMENT_ACTIONS;
export type SettlementValues = {
  reference: string;
  owner_client_id: string;
  gross: number;
  commission_type: "percentual" | "fixa";
  commission_value: number;
  due_on: string;
  action: SettlementAction;
  occurred_on: string | null;
  note: string;
};
export type SettlementRow = SettlementValues & {
  id: string;
  contract_id: string;
  property_id: string;
  property_code: string;
  contract_reference: string;
  owner_name: string | null;
  commission_amount: number;
  owner_amount: number;
  version: number;
  status: "previsto" | "recebido" | "repassado" | "cancelado";
  display_status: keyof typeof SETTLEMENT_STATUSES;
};
export type SettlementOption = {
  id: string;
  property_id: string;
  reference: string;
  property_code: string;
  owner_client_id: string;
  owner_name: string | null;
  purpose: "venda" | "locacao";
  amount: number;
  starts_on: string;
  ends_on: string | null;
  contract_status: string;
};
export type SettlementEvent = {
  id: string;
  version: number;
  action: SettlementAction;
  note: string;
  occurred_on: string | null;
  created_at: string;
  actor_name: string | null;
};
export type SettlementForm = {
  reference: string;
  gross: string;
  commission_type: "percentual" | "fixa";
  commission_value: string;
  due_on: string;
  occurred_on: string;
  note: string;
};
export function canWriteSettlements(role: string | null | undefined): boolean {
  return Boolean(
    role && ["superadmin", "proprietario", "administrador", "gestor", "financeiro"].includes(role),
  );
}
function zeroOrDecimal(value: string) {
  return /^0(?:[.,]0{1,2})?$/.test(value.trim()) ? 0 : parsePropertyDecimal(value);
}
export function commissionBreakdown(gross: number, type: "percentual" | "fixa", value: number) {
  if (
    !Number.isFinite(gross) ||
    gross <= 0 ||
    gross >= 1e12 ||
    !Number.isFinite(value) ||
    value < 0 ||
    (type === "percentual" ? value > 100 : value > gross)
  )
    throw new Error(
      "A comissão deve ficar entre zero e o valor bruto; o percentual máximo é 100%.",
    );
  const cents = Math.round(gross * 100),
    rate = Math.round(value * 100);
  const commission =
    type === "percentual" ? Number((BigInt(cents) * BigInt(rate) + 5000n) / 10000n) : rate;
  return { commission: commission / 100, owner: (cents - commission) / 100 };
}
function validDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === value &&
    value >= "2000-01-01" &&
    value <= "2100-12-31"
  );
}
export function settlementValues(
  form: SettlementForm,
  action: SettlementAction,
  owner: string,
  option?: SettlementOption,
): SettlementValues {
  const gross = parsePropertyDecimal(form.gross),
    value = zeroOrDecimal(form.commission_value);
  if (gross === null || value === null)
    throw new Error(
      "Informe valor bruto e comissão com até duas casas decimais, sem separador de milhar.",
    );
  commissionBreakdown(gross, form.commission_type, value);
  const reference = form.reference.trim().toUpperCase(),
    note = form.note.trim();
  if (!owner || !reference || reference.length > 60 || !note || note.length > 4000)
    throw new Error(
      "Informe contrato, referência e confirmação ou motivo com até 4000 caracteres.",
    );
  if (
    option?.purpose === "locacao" &&
    (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reference) ||
      reference < option.starts_on.slice(0, 7) ||
      (option.ends_on && reference > option.ends_on.slice(0, 7)))
  )
    throw new Error(
      `Use uma competência YYYY-MM de ${option.starts_on.slice(0, 7)}${option.ends_on ? ` até ${option.ends_on.slice(0, 7)}` : " em diante"}, dentro do período da locação.`,
    );
  if (!validDate(form.due_on))
    throw new Error("Informe uma data válida para a previsão do repasse.");
  if (
    ["recebido", "repassado"].includes(action) &&
    (!validDate(form.occurred_on) || form.occurred_on > proposalToday())
  )
    throw new Error("Informe a data em que a operação aconteceu, até hoje.");
  return {
    reference,
    owner_client_id: owner,
    gross,
    commission_type: form.commission_type,
    commission_value: value,
    due_on: form.due_on,
    action,
    occurred_on: ["recebido", "repassado"].includes(action) ? form.occurred_on : null,
    note,
  };
}
export function settlementError(error: unknown) {
  const e = error as { message?: string; code?: string };
  if (e?.message?.includes("CONFLICT"))
    return "O demonstrativo mudou. Atualize a lista e abra novamente.";
  if (e?.message?.includes("DUPLICATE"))
    return "Já existe demonstrativo para esta competência ou referência do contrato.";
  if (e?.message?.includes("DATE_INVALID"))
    return "Confira a data: o repasse não pode ser anterior ao recebimento nem posterior a hoje.";
  if (e?.message?.includes("PERIOD_INVALID"))
    return "Informe a competência YYYY-MM dentro do período da locação.";
  if (e?.message?.includes("OWNER_INVALID"))
    return "O proprietário do imóvel mudou ou está arquivado. Atualize a lista de contratos.";
  if (e?.message?.includes("CONTRACT_INVALID"))
    return "O contrato está cancelado ou mudou. Atualize a lista.";
  if (e?.code === "42501") return "Seu perfil ou empresa não permite esta operação financeira.";
  if (["22023", "23503", "23514", "23502", "22P02", "22007"].includes(e?.code || ""))
    return "Confira os campos e a situação do demonstrativo. O repasse exige recebimento confirmado.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}
