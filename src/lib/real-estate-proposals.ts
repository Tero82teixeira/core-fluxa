import { parsePropertyDecimal } from "./real-estate.ts";
export const PROPOSAL_STATUSES = {
  aberta: "Aberta",
  contraproposta: "Contraproposta",
  aceita: "Aceita",
  recusada: "Recusada",
  cancelada: "Cancelada",
} as const;
export const PROPOSAL_ACTIONS = {
  ...PROPOSAL_STATUSES,
  revisao: "Atualização de condições",
} as const;
export const PROPOSAL_PARTIES = {
  interessado: "Interessado",
  proprietario: "Proprietário",
  imobiliaria: "Imobiliária",
} as const;
export type ProposalStatus = keyof typeof PROPOSAL_STATUSES;
export type ProposalAction = keyof typeof PROPOSAL_ACTIONS;
export type ProposalValues = {
  interest_id: string;
  action: ProposalAction;
  amount: number;
  terms: string;
  valid_until: string;
  party: keyof typeof PROPOSAL_PARTIES;
  note: string | null;
};
export type ProposalRow = Omit<ProposalValues, "action"> & {
  id: string;
  version: number;
  status: ProposalStatus;
  display_status: ProposalStatus | "vencida";
  client_name: string | null;
  purpose: "venda" | "locacao";
  updated_at: string;
};
export type ProposalEvent = ProposalValues & {
  id: string;
  version: number;
  status: ProposalStatus;
  created_at: string;
  actor_name: string | null;
};
export type ProposalInterest = {
  id: string;
  client_name: string | null;
  purpose: "venda" | "locacao";
};
export function proposalToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function proposalDate(value: string): string {
  return value.split("-").reverse().join("/");
}
export function proposalValues(form: {
  interest_id: string;
  action: ProposalAction;
  amount: string;
  terms: string;
  valid_until: string;
  party: keyof typeof PROPOSAL_PARTIES;
  note: string;
}): ProposalValues {
  const amount = parsePropertyDecimal(form.amount);
  if (amount === null)
    throw new Error(
      "Informe um valor maior que zero, com até duas casas decimais. Exemplo: 240000,00.",
    );
  if (!form.interest_id) throw new Error("Selecione o interessado já cadastrado neste imóvel.");
  const terms = form.terms.trim(),
    note = form.note.trim();
  if (!terms || terms.length > 4000 || note.length > 4000)
    throw new Error("Informe condições com até 4000 caracteres.");
  const date = new Date(`${form.valid_until}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.valid_until) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== form.valid_until ||
    form.valid_until < "2000-01-01" ||
    form.valid_until > "2100-12-31"
  )
    throw new Error("Informe uma data de validade válida.");
  if (
    ["aberta", "contraproposta", "revisao", "aceita"].includes(form.action) &&
    form.valid_until < proposalToday()
  )
    throw new Error("A validade venceu. Atualize as condições antes de registrar o aceite.");
  if (["aceita", "recusada", "cancelada"].includes(form.action) && !note)
    throw new Error("Registre a confirmação ou o motivo desta decisão.");
  return { ...form, amount, terms, note: note || null };
}
export function proposalError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.message?.includes("CONTRACT_ACTIVE_PROPOSAL"))
    return "Encerre ou cancele o contrato antes de cancelar a proposta vinculada.";
  if (e?.message?.includes("CONFLICT"))
    return "A proposta mudou. Volte à lista, atualize e abra novamente.";
  if (e?.message?.includes("ALREADY_ACTIVE"))
    return "Este interessado já tem uma proposta ativa. Abra a negociação existente.";
  if (e?.message?.includes("ALREADY_ACCEPTED"))
    return "Já existe uma proposta aceita para esta finalidade do imóvel.";
  if (e?.message?.includes("EXPIRED"))
    return "A validade venceu. Atualize as condições antes do aceite.";
  if (e?.message?.includes("PROPERTY_CLOSED"))
    return "O imóvel ou interessado está encerrado ou indisponível para novas condições.";
  if (e?.message?.includes("TRANSITION_INVALID"))
    return "Esta negociação já mudou de situação. Atualize a lista.";
  if (e?.code === "42501")
    return "Seu perfil ou a configuração da empresa não permite esta operação.";
  if (["23514", "23503", "23502", "22023", "22P02", "22007"].includes(e?.code || ""))
    return "Confira valor, condições, validade e interessado da mesma empresa.";
  return "Não foi possível concluir. Verifique sua conexão e tente novamente.";
}
