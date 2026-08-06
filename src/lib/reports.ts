import type { AppRole } from "@/lib/domain";

export type PeriodPreset = "7d" | "30d" | "90d" | "month" | "previous_month" | "year" | "custom";
export type ReportFilters = {
  period: PeriodPreset;
  from?: string;
  to?: string;
  clientId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  processId?: string;
};

export function periodRange(preset: PeriodPreset, now = new Date(), custom?: { from?: string; to?: string }) {
  const end = new Date(now);
  const start = new Date(now);
  if (preset === "7d" || preset === "30d" || preset === "90d") start.setDate(start.getDate() - Number(preset.slice(0, -1)) + 1);
  if (preset === "month") start.setDate(1);
  if (preset === "previous_month") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }
  if (preset === "year") start.setMonth(0, 1);
  if (preset === "custom") {
    if (custom?.from) start.setTime(new Date(`${custom.from}T00:00:00`).getTime());
    if (custom?.to) end.setTime(new Date(`${custom.to}T23:59:59.999`).getTime());
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

export function isInPeriod(value: string | null | undefined, range: ReturnType<typeof periodRange>) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return timestamp >= range.from.getTime() && timestamp <= range.to.getTime();
}

export function isOverdue(due: string | null | undefined, status?: string, now = new Date()) {
  return Boolean(due && !["concluida", "cancelada", "arquivada", "aprovado"].includes(status ?? "") && new Date(due).getTime() < now.getTime());
}

export function monitoringBuckets(expiration: string | null | undefined, now = new Date()) {
  if (!expiration) return { expired: false, in7: false, in30: false };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiration.slice(0, 10)}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  return { expired: days < 0, in7: days >= 0 && days <= 7, in30: days >= 0 && days <= 30 };
}

export function groupCount<T>(rows: T[], key: (row: T) => string | null | undefined) {
  return rows.reduce<Record<string, number>>((result, row) => {
    const value = key(row) || "Não informado";
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

export const canSeeSensitive = (role: AppRole | null) => ["superadmin", "proprietario", "administrador", "gestor"].includes(role ?? "");

export function sanitizeClient<T extends Record<string, unknown>>(row: T, role: AppRole | null): T {
  if (canSeeSensitive(role)) return row;
  const safe = { ...row };
  for (const field of ["document", "document_digits", "birth_date", "email", "phone", "whatsapp", "zip_code", "street", "number", "complement", "district", "notes"]) delete safe[field];
  return safe;
}

const csvValue = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export function createCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "\uFEFF";
  const columns = Object.keys(rows[0]);
  return `\uFEFF${columns.map(csvValue).join(";")}\r\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(";")).join("\r\n")}`;
}

export function downloadCsv(type: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([createCsv(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fluxa-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
