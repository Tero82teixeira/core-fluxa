export type BillingSummaryItem = { status: string; amount: number; paid_amount: number };

export function summarizeHealthBilling(items: BillingSummaryItem[]) {
  return items.reduce(
    (summary, item) => {
      const amount = Number(item.amount || 0);
      const paid = Number(item.paid_amount || 0);
      if (item.status === "cancelado") return summary;
      if (item.status === "rascunho") {
        summary.drafts += amount;
        return summary;
      }
      summary.total += amount;
      summary.paid += paid;
      summary.open += Math.max(0, amount - paid);
      return summary;
    },
    { drafts: 0, total: 0, paid: 0, open: 0 },
  );
}

export function parseBillingAmount(value: string) {
  const clean = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(clean)) return NaN;
  return Number(clean.replace(",", "."));
}
