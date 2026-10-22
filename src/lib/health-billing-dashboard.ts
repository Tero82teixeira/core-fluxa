import type { HealthBillingBatch } from "@/hooks/use-health-billing-batches";
import type { HealthDenial } from "@/hooks/use-health-denials";
import { localCivilDate } from "./health-clinic-dashboard.ts";

export type HealthBillingPeriod = "30d" | "90d" | "year" | "all";

function civilDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  // Dates stay literal; timestamps are interpreted as instants in the browser's local day.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? localCivilDate(date) : null;
}

export function dateInHealthPeriod(
  value: string | null | undefined,
  period: HealthBillingPeriod,
  today = localCivilDate(),
) {
  if (period === "all") return true;
  const date = civilDate(value);
  if (!date || !civilDate(today) || date > today) return false;
  if (period === "year") return date >= `${today.slice(0, 4)}-01-01`;
  const threshold = new Date(`${today}T12:00:00Z`);
  // A 30-day window includes today and the preceding 29 civil days, regardless of DST.
  threshold.setUTCDate(threshold.getUTCDate() - (period === "30d" ? 29 : 89));
  return date >= threshold.toISOString().slice(0, 10);
}

/** Administrative batch totals, separate from individual cash receipts. */
export function summarizeHealthBillingDashboard(
  batches: HealthBillingBatch[],
  denials: HealthDenial[],
  period: HealthBillingPeriod,
  today = localCivilDate(),
) {
  const includedBatches = batches.filter(
    (batch) =>
      !["rascunho", "cancelado"].includes(batch.status) &&
      dateInHealthPeriod(batch.submitted_at ?? batch.created_at, period, today),
  );
  const includedDenials = denials.filter(
    (denial) =>
      denial.status !== "cancelada" &&
      dateInHealthPeriod(denial.received_at ?? denial.created_at, period, today),
  );
  const billed = includedBatches.reduce((sum, batch) => sum + Number(batch.total_amount || 0), 0);
  const received = includedBatches.reduce((sum, batch) => sum + Number(batch.paid_amount || 0), 0);
  const pending = includedBatches.reduce(
    (sum, batch) => sum + Number(batch.pending_amount || 0),
    0,
  );
  const denied = includedDenials.reduce(
    (sum, denial) => sum + Number(denial.denied_amount || 0),
    0,
  );
  const recovered = includedDenials.reduce(
    (sum, denial) => sum + Number(denial.recovered_amount || 0),
    0,
  );
  const overdue = includedBatches.filter(
    (batch) =>
      batch.expected_payment_at &&
      batch.expected_payment_at < today &&
      Number(batch.pending_amount || 0) > 0 &&
      batch.status !== "pago",
  );
  const insurers = new Map<
    string,
    { id: string; name: string; billed: number; received: number; pending: number; batches: number }
  >();
  for (const batch of includedBatches) {
    const row = insurers.get(batch.insurer_id) ?? {
      id: batch.insurer_id,
      name: batch.insurer_name || "Convênio",
      billed: 0,
      received: 0,
      pending: 0,
      batches: 0,
    };
    row.billed += Number(batch.total_amount || 0);
    row.received += Number(batch.paid_amount || 0);
    row.pending += Number(batch.pending_amount || 0);
    row.batches += 1;
    insurers.set(batch.insurer_id, row);
  }
  return {
    billed,
    received,
    pending,
    denied,
    recovered,
    overdue,
    receiptRate: billed > 0 ? received / billed : 0,
    denialRate: billed > 0 ? denied / billed : 0,
    recoveryRate: denied > 0 ? recovered / denied : 0,
    byInsurer: [...insurers.values()].sort((a, b) => b.billed - a.billed),
  };
}
