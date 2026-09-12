export type AsaasCollectionCharge = {
  id: string;
  client_id: string;
  transaction_id: string;
  amount: number;
  due_date: string;
  status: string;
};

export type AsaasCollectionJob = {
  id: string;
  transaction_id: string;
  status: string;
  attempts: number;
  last_attempt_at?: string | null;
  last_error_code?: string | null;
};

export type AsaasCollectionTransaction = { id: string; status: string };

export type AsaasCollectionSummary = {
  awaiting: number;
  overdue: number;
  received: number;
  delinquentClients: number;
  aging: { firstWeek: number; firstMonth: number; older: number };
  issues: number;
};

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function asaasCollectionSummary(
  charges: AsaasCollectionCharge[],
  jobs: AsaasCollectionJob[],
  transactions: AsaasCollectionTransaction[],
  now = new Date(),
): AsaasCollectionSummary {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const openStatuses = new Set(["pending", "confirmed", "overdue"]);
  const open = charges.filter((charge) => openStatuses.has(charge.status));
  const overdueRows = open.filter((charge) => new Date(`${charge.due_date}T00:00:00`) < today);
  const daysLate = (dueDate: string) =>
    Math.max(
      0,
      Math.floor((today.getTime() - new Date(`${dueDate}T00:00:00`).getTime()) / 86_400_000),
    );
  const transactionStatus = new Map(transactions.map((row) => [row.id, row.status]));
  const staleProcessingCutoff = now.getTime() - 15 * 60_000;
  const jobIssues = jobs.filter(
    (job) =>
      job.status === "failed" ||
      (job.status === "processing" &&
        Boolean(job.last_attempt_at) &&
        new Date(job.last_attempt_at!).getTime() < staleProcessingCutoff),
  ).length;
  const reconciliationIssues = charges.filter((charge) => {
    const status = transactionStatus.get(charge.transaction_id);
    return (
      (charge.status === "received" && status !== "paid") ||
      (openStatuses.has(charge.status) && status === "paid")
    );
  }).length;
  return {
    awaiting: open.reduce((total, charge) => total + amount(charge.amount), 0),
    overdue: overdueRows.reduce((total, charge) => total + amount(charge.amount), 0),
    received: charges
      .filter((charge) => charge.status === "received")
      .reduce((total, charge) => total + amount(charge.amount), 0),
    delinquentClients: new Set(overdueRows.map((charge) => charge.client_id)).size,
    aging: {
      firstWeek: overdueRows
        .filter((charge) => daysLate(charge.due_date) <= 7)
        .reduce((total, charge) => total + amount(charge.amount), 0),
      firstMonth: overdueRows
        .filter((charge) => daysLate(charge.due_date) >= 8 && daysLate(charge.due_date) <= 30)
        .reduce((total, charge) => total + amount(charge.amount), 0),
      older: overdueRows
        .filter((charge) => daysLate(charge.due_date) > 30)
        .reduce((total, charge) => total + amount(charge.amount), 0),
    },
    issues: jobIssues + reconciliationIssues,
  };
}

export function asaasErrorMessage(error: unknown) {
  const code = String((error as Error)?.message ?? error).toUpperCase();
  if (code.includes("CLIENT_DOCUMENT_REQUIRED"))
    return "Cadastre o CPF ou CNPJ do cliente antes de gerar a cobrança.";
  if (code.includes("CLIENT_REQUIRED") || code.includes("REQUIRES_CLIENT"))
    return "Vincule um cliente ao lançamento antes de gerar a cobrança.";
  if (code.includes("NOT_CONNECTED") || code.includes("CONNECTION"))
    return "Conecte a conta Asaas da empresa em Configurações > Financeiro.";
  if (code.includes("KEY_ENVIRONMENT_MISMATCH"))
    return "A chave não pertence ao ambiente Asaas selecionado.";
  if (code.includes("INVALID_ACCESS_TOKEN") || code.includes("UNAUTHORIZED"))
    return "A chave do Asaas é inválida ou foi revogada.";
  if (code.includes("ENCRYPTION_KEY_MISSING"))
    return "A proteção das credenciais Asaas não está configurada.";
  if (code.includes("SETTLEMENT_ACCOUNT"))
    return "Selecione uma conta financeira ativa para receber os pagamentos.";
  if (code.includes("PAYMENT_EXISTS") || code.includes("ALREADY_PAID"))
    return "Este lançamento já possui pagamento registrado.";
  if (code.includes("RECONCILIATION_FAILED"))
    return "O Asaas respondeu, mas a conciliação precisa de atenção.";
  if (code.includes("NOT_ELIGIBLE")) return "Este lançamento não pode gerar uma cobrança Asaas.";
  return "Não foi possível concluir a operação no Asaas. Consulte o painel de integração.";
}
