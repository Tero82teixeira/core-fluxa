import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeHealthBilling, parseBillingAmount } from "../src/lib/health-billing-summary.ts";

test("rascunhos e cancelados não inflam faturado nem saldo em aberto", () => {
  assert.deepEqual(
    summarizeHealthBilling([
      { status: "rascunho", amount: 100, paid_amount: 0 },
      { status: "cancelado", amount: 300, paid_amount: 0 },
      { status: "enviado", amount: 80, paid_amount: 0 },
      { status: "parcial", amount: 100, paid_amount: 40 },
      { status: "pago", amount: 50, paid_amount: 50 },
    ]),
    { drafts: 100, total: 230, paid: 90, open: 140 },
  );
});
test("lista vazia e valores decimais", () => {
  assert.deepEqual(summarizeHealthBilling([]), { drafts: 0, total: 0, paid: 0, open: 0 });
  assert.equal(parseBillingAmount("100,25"), 100.25);
  assert.equal(parseBillingAmount("40.50"), 40.5);
  for (const invalid of ["", "NaN", "Infinity", "1e2", "10,001", "-1", "1.000,00"]) {
    assert.equal(Number.isNaN(parseBillingAmount(invalid)), true);
  }
});
