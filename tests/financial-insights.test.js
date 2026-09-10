import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cashFlowForecast, managerialIncomeStatement, profitabilityByDimension } from "../src/lib/finance.ts";

const route = readFileSync("src/routes/_authenticated/financeiro.tsx", "utf8");
const hook = readFileSync("src/hooks/use-finance.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260926120000_financial_profitability_forecast.sql",
  "utf8",
);

test("profitability keeps legacy entries visible without inventing a client", () => {
  const rows = profitabilityByDimension(
    [
      { type: "income", amount: 1000, status: "paid", due_date: "2026-09-10", client_id: "a" },
      { type: "expense", amount: 400, status: "pending", due_date: "2026-09-12", client_id: "a" },
      { type: "expense", amount: 100, status: "pending", due_date: "2026-09-13" },
      { type: "income", amount: 900, status: "cancelled", due_date: "2026-09-14", client_id: "a" },
    ],
    "client",
    new Map([["a", "Cliente A"]]),
  );
  assert.deepEqual(rows, [
    {
      id: "a",
      name: "Cliente A",
      income: 1000,
      expense: 400,
      result: 600,
      margin: 60,
      transactionCount: 2,
      unclassified: false,
    },
    {
      id: "unclassified",
      name: "Não classificados",
      income: 0,
      expense: 100,
      result: -100,
      margin: null,
      transactionCount: 1,
      unclassified: true,
    },
  ]);
});

test("profitability uses competence date and respects the selected period", () => {
  const rows = profitabilityByDimension(
    [
      { type: "income", amount: 200, status: "paid", due_date: "2026-10-10", competence_date: "2026-09-01", process_id: "p" },
      { type: "expense", amount: 50, status: "paid", due_date: "2026-08-31", process_id: "p" },
    ],
    "process",
    new Map([["p", "PROC-1"]]),
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].result, 200);
});

test("cash-flow forecast subtracts partial payments and projects cumulative balance", () => {
  const rows = cashFlowForecast(
    [
      { id: "late", type: "income", amount: 250, status: "partial", due_date: "2026-09-09" },
      { id: "week", type: "expense", amount: 300, status: "pending", due_date: "2026-09-17" },
      { id: "month", type: "income", amount: 500, status: "pending", due_date: "2026-10-01" },
      { id: "sixty", type: "expense", amount: 100, status: "pending", due_date: "2026-10-25" },
      { id: "ignored", type: "income", amount: 999, status: "paid", due_date: "2026-09-11" },
    ],
    [{ transaction_id: "late", amount: 50 }],
    1000,
    new Date("2026-09-10T12:00:00Z"),
  );
  assert.deepEqual(
    rows.map(({ income, expense, projectedBalance }) => ({ income, expense, projectedBalance })),
    [
      { income: 200, expense: 0, projectedBalance: 1200 },
      { income: 0, expense: 300, projectedBalance: 900 },
      { income: 500, expense: 0, projectedBalance: 1400 },
      { income: 0, expense: 100, projectedBalance: 1300 },
    ],
  );
});

test("managerial DRE groups expenses by category and uses competence", () => {
  const statement = managerialIncomeStatement(
    [
      { type: "income", amount: 1000, status: "paid", due_date: "2026-10-10", competence_date: "2026-09-01" },
      { type: "expense", amount: 250, status: "pending", due_date: "2026-09-05", category_id: "people" },
      { type: "expense", amount: 50, status: "pending", due_date: "2026-09-06" },
      { type: "expense", amount: 999, status: "cancelled", due_date: "2026-09-07", category_id: "people" },
    ],
    [{ id: "people", name: "Pessoas", type: "expense", is_active: true }],
    "2026-09-01",
    "2026-09-30",
  );
  assert.deepEqual(
    { income: statement.income, expense: statement.expense, result: statement.result, margin: statement.margin },
    { income: 1000, expense: 300, result: 700, margin: 70 },
  );
  assert.deepEqual(statement.rows.map(({ label, amount }) => [label, amount]), [
    ["Receita operacional", 1000],
    ["Pessoas", 250],
    ["Despesas não classificadas", 50],
    ["Total de despesas", 300],
    ["Resultado do período", 700],
  ]);
});

test("financial screen explains forecasts and allows real business links", () => {
  for (const label of [
    "Rentabilidade",
    "Fluxo de caixa previsto",
    "Saldo projetado em 7 dias",
    "Saldo projetado em 30 dias",
    "Saldo projetado em 60 dias",
    "Cliente (rentabilidade)",
    "Processo (rentabilidade)",
    "Não classificados",
    "DRE gerencial simplificada",
    "Demonstrativo por competência",
  ]) assert.ok(route.includes(label), `missing ${label}`);
  assert.match(hook, /id,code,title,client_id/);
});

test("link updates remain guarded, tenant-safe and auditable", () => {
  assert.match(migration, /financial_assert_editor\(_organization_id\)/);
  assert.match(migration, /INVALID_PROCESS_CLIENT/);
  assert.match(migration, /client_id = CASE WHEN _payload \? 'client_id'/);
  assert.match(migration, /process_id = CASE WHEN _payload \? 'process_id'/);
  assert.match(migration, /financial_audit/);
  assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?public\.financial_/i);
});
