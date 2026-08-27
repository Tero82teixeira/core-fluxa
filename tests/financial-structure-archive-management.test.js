import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const structures = readFileSync(
  "src/components/finance/financial-structures.tsx",
  "utf8",
);
const hook = readFileSync("src/hooks/use-finance.ts", "utf8");
const errors = readFileSync("src/lib/errors.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260827130000_restore_financial_structures.sql",
  "utf8",
);

test("categorias e contas alternam exclusivamente entre ativas e arquivadas", () => {
  assert.equal(
    [...structures.matchAll(/Boolean\(row\.archived_at\) === showArchived/g)].length,
    2,
  );
  assert.match(structures, /showArchived \? "Ver ativas" : "Arquivadas"/);
  assert.match(structures, /Nenhuma categoria arquivada/);
  assert.match(structures, /Nenhuma conta arquivada/);
});

test("estruturas arquivadas oferecem somente restauração confirmada", () => {
  assert.match(structures, /if \(row\.archived_at\)/);
  assert.match(structures, /Restaurar \{noun\}\?/);
  assert.match(structures, /Confirmar restauração/);
  assert.match(structures, /voltará à lista como inativa/);
  assert.match(structures, /Ative depois somente se quiser usá-la/);
});

test("restauração usa RPCs e atualiza a consulta financeira", () => {
  assert.match(structures, /restore: "restore_financial_category"/);
  assert.match(structures, /restore: "restore_financial_account"/);
  assert.match(hook, /invalidateQueries\(\{ queryKey: \["finance", organizationId\] \}\)/);
  assert.match(types, /restore_financial_category:/);
  assert.match(types, /restore_financial_account:/);
});

test("RPCs são tenant-safe, mantêm inatividade e registram auditoria", () => {
  assert.equal(
    [...migration.matchAll(/financial_assert_editor\(_organization_id\)/g)].length,
    2,
  );
  assert.equal(
    [...migration.matchAll(/organization_id = _organization_id/g)].length,
    2,
  );
  assert.equal([...migration.matchAll(/archived_at IS NOT NULL/g)].length, 2);
  assert.equal([...migration.matchAll(/is_active = false/g)].length, 2);
  assert.match(migration, /financial\.category\.restored/);
  assert.match(migration, /financial\.account\.restored/);
});

test("RPCs têm privilégios mínimos e erros seguros em português", () => {
  for (const rpc of ["restore_financial_category", "restore_financial_account"]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\(uuid, jsonb\\)[\\s\\S]*?FROM PUBLIC, anon, service_role`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(uuid, jsonb\\)[\\s\\S]*?TO authenticated`,
      ),
    );
  }
  assert.match(errors, /category_not_restorable/);
  assert.match(errors, /account_not_restorable/);
  assert.match(structures, /describeError\(error\)/);
});
