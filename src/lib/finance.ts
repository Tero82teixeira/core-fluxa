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

export function canManageFinance(role?: string | null) {
  return role === "proprietario" || role === "administrador" || role === "gestor";
}

export function canReverseFinancialPayment(role?: string | null) {
  return role === "proprietario" || role === "administrador";
}

export type FinancialPayment = { amount: number; reversed_at?: string | null };
export function paymentTotals(amount: number, payments: FinancialPayment[]) {
  const paid = payments.filter((payment) => !payment.reversed_at).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const reversed = payments.filter((payment) => payment.reversed_at).reduce((sum, payment) => sum + Number(payment.amount), 0);
  return { original: Number(amount), paid, reversed, remaining: Math.max(0, Number(amount) - paid) };
}

export function validateFinancialPayment(
  transaction: { amount: number; status: FinancialStatus; archived_at?: string | null },
  payments: FinancialPayment[],
  amount: number,
) {
  if (transaction.archived_at || transaction.status === "cancelled" || transaction.status === "paid") return "TRANSACTION_NOT_PAYABLE";
  if (!Number.isFinite(amount) || amount <= 0) return "INVALID_AMOUNT";
  if (amount > paymentTotals(transaction.amount, payments).remaining) return "PAYMENT_EXCEEDS_BALANCE";
  return null;
}

export function displayFinancialStatus(status: FinancialStatus, dueDate: string, now = new Date()) {
  return financialBuckets(dueDate, status, now).overdue ? "overdue" : status;
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
