import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/routes/_authenticated/financeiro.tsx", "utf8");
const hook = readFileSync("src/hooks/use-finance.ts", "utf8");
const errors = readFileSync("src/lib/errors.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260827120000_restore_financial_transactions.sql",
  "utf8",
);

test("filtro alterna de forma exclusiva entre ativos e arquivados", () => {
  assert.match(route, /Boolean\(x\.archived_at\) === showArchived/);
  assert.match(route, /showArchived \? "Ver ativos" : "Arquivados"/);
  assert.match(route, /setShowArchived\(!p\.showArchived\)/);
  assert.match(route, /setStatus\("all"\)/);
  assert.match(route, /Nenhum lançamento arquivado encontrado/);
});

test("lançamento arquivado pode ser restaurado com confirmação", () => {
  assert.match(route, /editable && transaction\.archived_at/);
  assert.match(route, /Restaurar este lançamento\?/);
  assert.match(route, /Confirmar restauração/);
  assert.match(route, /"restore_financial_transaction"/);
  assert.match(route, /Lançamento restaurado/);
});

test("restauração usa apenas a RPC e atualiza a consulta financeira", () => {
  assert.match(hook, /invalidateQueries\(\{ queryKey: \["finance", organizationId\] \}\)/);
  assert.doesNotMatch(route, /\.from\("financial_transactions"\)[\s\S]{0,120}\.update\(/);
  assert.match(types, /restore_financial_transaction:/);
});

test("RPC é tenant-safe, limitada a estados finais e auditada", () => {
  assert.match(migration, /financial_assert_editor\(_organization_id\)/);
  assert.match(migration, /organization_id = _organization_id/);
  assert.match(migration, /archived_at IS NOT NULL/);
  assert.match(migration, /status IN \('paid', 'cancelled'\)/);
  assert.match(migration, /financial\.transaction\.restored/);
  assert.match(migration, /TRANSACTION_NOT_RESTORABLE/);
});

test("RPC tem privilégios mínimos e mensagem segura", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.restore_financial_transaction\(uuid, jsonb\)[\s\S]*FROM PUBLIC, anon, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.restore_financial_transaction\(uuid, jsonb\)[\s\S]*TO authenticated/,
  );
  assert.match(errors, /transaction_not_restorable/);
});
