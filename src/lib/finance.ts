import type { AppRole } from "@/lib/domain";
import { permissionsForRole } from "@/lib/access-control";

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

export function canViewFinance(role?: AppRole | null) {
  return permissionsForRole(role ?? null).canViewFinance;
}

export function canManageFinance(role?: AppRole | null) {
  return permissionsForRole(role ?? null).canManageFinance;
}

export function canReverseFinancialPayment(role?: AppRole | null) {
  return role === "superadmin" || role === "proprietario" || role === "administrador";
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
