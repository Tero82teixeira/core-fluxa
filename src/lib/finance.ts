export { canManageFinance } from "./access-control.ts";

export type FinancialType = "income" | "expense";
export type FinancialStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";

export type FinancialCategory = {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  description?: string | null;
  color?: string | null;
  is_active: boolean;
  archived_at?: string | null;
};

export type FinancialAccount = {
  id: string;
  name: string;
  type: "cash" | "bank" | "digital_wallet" | "other";
  description?: string | null;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  archived_at?: string | null;
};

/** Options allowed by the database RPCs for a new transaction. */
export function availableFinancialCategories(categories: FinancialCategory[], type: FinancialType) {
  return categories.filter(
    (category) =>
      !category.archived_at &&
      category.is_active &&
      (category.type === type || category.type === "both"),
  );
}

export function availableFinancialAccounts(accounts: FinancialAccount[]) {
  return accounts.filter((account) => !account.archived_at && account.is_active);
}

export function canReverseFinancialPayment(role?: string | null) {
  return role === "proprietario" || role === "administrador";
}

export function paymentBalance(
  amount: number,
  payments: { amount: number; reversed_at?: string | null }[],
) {
  const confirmed = payments
    .filter((payment) => !payment.reversed_at)
    .reduce((total, payment) => total + Number(payment.amount), 0);
  return Math.max(0, Number(amount) - confirmed);
}

type CashFlowTransaction = { id: string; type: FinancialType };
type CashFlowPayment = {
  transaction_id: string;
  amount: number;
  paid_at: string;
  reversed_at?: string | null;
};

export type MonthlyCashFlow = {
  month: string;
  entradas: number;
  saidas: number;
  fluxo: number;
};

export type ProfitabilityDimension = "client" | "process";

export type ProfitabilityRow = {
  id: string;
  name: string;
  income: number;
  expense: number;
  result: number;
  margin: number | null;
  transactionCount: number;
  unclassified: boolean;
};

export type ManagerialIncomeStatementRow = {
  id: string;
  label: string;
  kind: "income" | "expense" | "total" | "result";
  amount: number;
  percentageOfRevenue: number | null;
};

export type ManagerialIncomeStatement = {
  rows: ManagerialIncomeStatementRow[];
  income: number;
  expense: number;
  result: number;
  margin: number | null;
};

type ProfitabilityTransaction = {
  type: FinancialType;
  amount: number;
  status: FinancialStatus;
  due_date: string;
  competence_date?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  archived_at?: string | null;
  category_id?: string | null;
  categories?: { name?: string | null } | null;
};

/** Builds a simplified managerial DRE by competence, using only registered categories. */
export function managerialIncomeStatement(
  transactions: ProfitabilityTransaction[],
  categories: FinancialCategory[],
  from?: string,
  to?: string,
): ManagerialIncomeStatement {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const expenses = new Map<string, { label: string; amount: number }>();
  let income = 0;

  for (const transaction of transactions) {
    if (transaction.archived_at || transaction.status === "cancelled") continue;
    const date = (transaction.competence_date || transaction.due_date).slice(0, 10);
    if ((from && date < from) || (to && date > to)) continue;
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (transaction.type === "income") {
      income += amount;
      continue;
    }
    const id = transaction.category_id || "unclassified";
    const label = transaction.category_id
      ? categoryNames.get(transaction.category_id) || transaction.categories?.name || "Categoria não encontrada"
      : "Despesas não classificadas";
    const current = expenses.get(id) ?? { label, amount: 0 };
    current.amount += amount;
    expenses.set(id, current);
  }

  const expense = [...expenses.values()].reduce((total, row) => total + row.amount, 0);
  const result = income - expense;
  const percentage = (amount: number) => (income > 0 ? (amount / income) * 100 : null);
  return {
    income,
    expense,
    result,
    margin: percentage(result),
    rows: [
      { id: "revenue", label: "Receita operacional", kind: "income", amount: income, percentageOfRevenue: percentage(income) },
      ...[...expenses.entries()]
        .map(([id, row]) => ({ id, label: row.label, kind: "expense" as const, amount: row.amount, percentageOfRevenue: percentage(row.amount) }))
        .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR")),
      { id: "expenses", label: "Total de despesas", kind: "total", amount: expense, percentageOfRevenue: percentage(expense) },
      { id: "result", label: "Resultado do período", kind: "result", amount: result, percentageOfRevenue: percentage(result) },
    ],
  };
}

/** Calculates accrual profitability without inventing links for legacy entries. */
export function profitabilityByDimension(
  transactions: ProfitabilityTransaction[],
  dimension: ProfitabilityDimension,
  names: Map<string, string>,
  from?: string,
  to?: string,
): ProfitabilityRow[] {
  const rows = new Map<string, Omit<ProfitabilityRow, "result" | "margin">>();
  for (const transaction of transactions) {
    if (transaction.archived_at || transaction.status === "cancelled") continue;
    const date = (transaction.competence_date || transaction.due_date).slice(0, 10);
    if ((from && date < from) || (to && date > to)) continue;
    const linkedId = dimension === "client" ? transaction.client_id : transaction.process_id;
    const id = linkedId || "unclassified";
    const current = rows.get(id) ?? {
      id,
      name: linkedId ? names.get(linkedId) || "Cadastro não encontrado" : "Não classificados",
      income: 0,
      expense: 0,
      transactionCount: 0,
      unclassified: !linkedId,
    };
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (transaction.type === "income") current.income += amount;
    else current.expense += amount;
    current.transactionCount += 1;
    rows.set(id, current);
  }
  return [...rows.values()]
    .map((row) => {
      const result = row.income - row.expense;
      return {
        ...row,
        result,
        margin: row.income > 0 ? (result / row.income) * 100 : null,
      };
    })
    .sort((a, b) => Number(a.unclassified) - Number(b.unclassified) || b.result - a.result);
}

export type CashFlowForecastBucket = {
  key: "overdue" | "days7" | "days30" | "days60";
  label: string;
  income: number;
  expense: number;
  net: number;
  projectedBalance: number;
};

type ForecastTransaction = {
  id: string;
  type: FinancialType;
  amount: number;
  status: FinancialStatus;
  due_date: string;
  archived_at?: string | null;
};

/** Projects open balances by due date. Overdue amounts remain explicit instead of being hidden. */
export function cashFlowForecast(
  transactions: ForecastTransaction[],
  payments: { transaction_id: string; amount: number; reversed_at?: string | null }[],
  currentBalance: number,
  today = new Date(),
): CashFlowForecastBucket[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const paidByTransaction = new Map<string, number>();
  payments
    .filter((payment) => !payment.reversed_at)
    .forEach((payment) =>
      paidByTransaction.set(
        payment.transaction_id,
        (paidByTransaction.get(payment.transaction_id) ?? 0) + Number(payment.amount),
      ),
    );
  const buckets: CashFlowForecastBucket[] = [
    { key: "overdue", label: "Vencidos e hoje", income: 0, expense: 0, net: 0, projectedBalance: 0 },
    { key: "days7", label: "Próximos 7 dias", income: 0, expense: 0, net: 0, projectedBalance: 0 },
    { key: "days30", label: "De 8 a 30 dias", income: 0, expense: 0, net: 0, projectedBalance: 0 },
    { key: "days60", label: "De 31 a 60 dias", income: 0, expense: 0, net: 0, projectedBalance: 0 },
  ];
  for (const transaction of transactions) {
    if (
      transaction.archived_at ||
      ["paid", "cancelled"].includes(transaction.status)
    ) continue;
    const remaining = Math.max(
      0,
      Number(transaction.amount) - (paidByTransaction.get(transaction.id) ?? 0),
    );
    if (!Number.isFinite(remaining) || remaining <= 0) continue;
    const due = new Date(`${transaction.due_date.slice(0, 10)}T00:00:00`);
    const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
    const bucket =
      days <= 0 ? buckets[0] : days <= 7 ? buckets[1] : days <= 30 ? buckets[2] : days <= 60 ? buckets[3] : null;
    if (!bucket) continue;
    if (transaction.type === "income") bucket.income += remaining;
    else bucket.expense += remaining;
  }
  let balance = Number(currentBalance) || 0;
  return buckets.map((bucket) => {
    bucket.net = bucket.income - bucket.expense;
    balance += bucket.net;
    bucket.projectedBalance = balance;
    return bucket;
  });
}

/** Groups realized payments and their reversals by the month in which cash actually moved. */
export function monthlyCashFlow(
  transactions: CashFlowTransaction[],
  payments: CashFlowPayment[],
): MonthlyCashFlow[] {
  const transactionTypes = new Map(transactions.map(({ id, type }) => [id, type]));
  const months = new Map<string, MonthlyCashFlow>();

  const addMovement = (date: string, type: FinancialType, amount: number) => {
    const month = date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const current = months.get(month) ?? { month, entradas: 0, saidas: 0, fluxo: 0 };
    if (type === "income") current.entradas += amount;
    else current.saidas += amount;
    current.fluxo += type === "income" ? amount : -amount;
    months.set(month, current);
  };

  payments.forEach((payment) => {
    const type = transactionTypes.get(payment.transaction_id);
    const amount = Number(payment.amount);
    if (!type || !Number.isFinite(amount) || amount <= 0) return;

    addMovement(payment.paid_at, type, amount);
    if (payment.reversed_at) {
      addMovement(payment.reversed_at, type === "income" ? "expense" : "income", amount);
    }
  });

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}

export function displayedFinancialStatus(
  status: FinancialStatus,
  dueDate: string,
  now = new Date(),
): FinancialStatus {
  return financialBuckets(dueDate, status, now).overdue ? "overdue" : status;
}

/** Matches the status filter against the same effective status shown in financial lists. */
export function matchesDisplayedFinancialStatus(
  status: FinancialStatus,
  dueDate: string,
  filter: FinancialStatus | "all",
  now = new Date(),
) {
  return filter === "all" || displayedFinancialStatus(status, dueDate, now) === filter;
}

export const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
export const brDate = (value?: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export function financialBuckets(dueDate: string, status: FinancialStatus, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const open = !["paid", "cancelled"].includes(status);
  return {
    overdue: open && days < 0,
    in7: open && days >= 0 && days <= 7,
    in30: open && days >= 0 && days <= 30,
  };
}

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export function financialCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "\uFEFF";
  const columns = Object.keys(rows[0]);
  return `\uFEFF${columns.map(csvCell).join(";")}\r\n${rows.map((row) => columns.map((key) => csvCell(row[key])).join(";")).join("\r\n")}`;
}

export function downloadFinancialCsv(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([financialCsv(rows)], { type: "text/csv;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `fluxa-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}
