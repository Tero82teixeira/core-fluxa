import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  "src/routes/_authenticated/financeiro.tsx",
  "utf8",
);
const hook = readFileSync("src/hooks/use-finance.ts", "utf8");
const errors = readFileSync("src/lib/errors.ts", "utf8");
const hardening = readFileSync(
  "supabase/migrations/20260818210000_harden_financial_integrity.sql",
  "utf8",
);

test("gestores financeiros recebem ação clara para editar lançamentos abertos", () => {
  assert.match(route, /<Pencil\s*\/>\s*Editar/);
  assert.match(route, /Editar lançamento/);
  assert.match(route, /editable\s*&&[\s\S]*?!\["paid", "cancelled"\]\.includes/);
});

test("edição usa exclusivamente a RPC financeira e invalida a consulta", () => {
  assert.match(route, /rpc:\s*"update_financial_transaction"/);
  assert.match(route, /payload:\s*\{ id: transaction\.id, \.\.\.payload \}/);
  assert.match(hook, /invalidateQueries\(\{ queryKey: \["finance", organizationId\] \}\)/);
  assert.doesNotMatch(route, /\.from\("financial_transactions"\)[\s\S]{0,120}\.update\(/);
});

test("formulário preenche e salva apenas os campos aceitos pelo contrato atual", () => {
  for (const field of [
    "description",
    "amount",
    "due_date",
    "category_id",
    "account_id",
    "notes",
  ]) {
    assert.match(route, new RegExp(field));
    assert.match(hardening, new RegExp(field));
  }
  assert.match(route, /Tipo[\s\S]*Receita[\s\S]*Despesa[\s\S]*disabled/);
});

test("valor editado respeita pagamentos ativos no frontend e no banco", () => {
  assert.match(route, /amount < paidTotal/);
  assert.match(route, /Math\.max\(0\.01, paidTotal\)/);
  assert.match(route, /total já pago de \{brl\(paidTotal\)\}/);
  assert.match(hardening, /new_amount < paid_total/);
  assert.match(hardening, /AMOUNT_BELOW_PAID_TOTAL/);
});

test("categorias e contas atuais permanecem visíveis durante a edição", () => {
  assert.match(route, /currentCategory[\s\S]*\.\.\.availableCategories, currentCategory/);
  assert.match(route, /currentAccount[\s\S]*\.\.\.availableAccounts, currentAccount/);
});

test("erros financeiros recebem mensagens seguras em português", () => {
  assert.match(route, /describeError\(error\)/);
  assert.match(errors, /amount_below_paid_total/);
  assert.match(errors, /transaction_not_editable/);
});
