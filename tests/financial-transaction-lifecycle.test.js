import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/routes/_authenticated/financeiro.tsx", "utf8");
const hook = readFileSync("src/hooks/use-finance.ts", "utf8");
const errors = readFileSync("src/lib/errors.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260807132133_68f5e762-788a-4cfb-b479-9811313e523a.sql",
  "utf8",
);

test("lançamentos abertos sem pagamento podem ser cancelados com confirmação", () => {
  assert.match(route, /Cancelar este lançamento\?/);
  assert.match(route, /Confirmar cancelamento/);
  assert.match(route, /rpc, payload: \{ id: transaction\.id \}/);
  assert.match(route, /"cancel_financial_transaction"/);
  assert.match(route, /paidTotal > 0/);
  assert.match(route, /Estorne os pagamentos antes de cancelar/);
});

test("somente lançamentos pagos ou cancelados oferecem arquivamento", () => {
  assert.match(route, /\["paid", "cancelled"\]\.includes\(transaction\.status\)/);
  assert.match(route, /Arquivar este lançamento\?/);
  assert.match(route, /Confirmar arquivamento/);
  assert.match(route, /"archive_financial_transaction"/);
  assert.match(route, /histórico\s+financeiro e a auditoria serão preservados/);
});

test("ciclo usa apenas RPCs protegidas e atualiza a consulta financeira", () => {
  for (const rpc of ["cancel_financial_transaction", "archive_financial_transaction"]) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`));
    assert.match(migration, new RegExp(`'${rpc}'`));
  }
  assert.match(migration, /GRANT EXECUTE ON FUNCTION %s TO authenticated/);
  assert.match(hook, /invalidateQueries\(\{ queryKey: \["finance", organizationId\] \}\)/);
  assert.doesNotMatch(route, /\.from\("financial_transactions"\)[\s\S]{0,120}\.(?:update|delete)\(/);
});

test("banco preserva pagamentos e limita arquivamento aos estados finais", () => {
  assert.match(migration, /REVERSE_PAYMENTS_FIRST/);
  assert.match(migration, /status IN\('paid','cancelled'\)/);
  assert.match(migration, /TRANSACTION_NOT_ARCHIVABLE/);
  assert.match(migration, /financial\.transaction\.cancelled/);
  assert.match(migration, /financial\.transaction\.archived/);
});

test("falhas do ciclo financeiro têm mensagens seguras em português", () => {
  assert.match(route, /toast\.error\(describeError\(error\)\)/);
  assert.match(errors, /reverse_payments_first/);
  assert.match(errors, /transaction_not_archivable/);
});
