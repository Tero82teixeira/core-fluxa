import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260808120000_secure_financial_recurrences.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("segurança das recorrências financeiras", () => {
  test("instala validação antes de inserções e atualizações", () => {
    assert.match(
      migration,
      /CREATE TRIGGER financial_validate_recurrence_links\s+BEFORE INSERT OR UPDATE ON public\.financial_recurrences/,
    );
    assert.match(migration, /EXECUTE FUNCTION public\.financial_validate_recurrence_links\(\)/);
  });

  test("rejeita todos os vínculos pertencentes a outra organização", () => {
    const links = [
      ["financial_categories", "category_id", "INVALID_CATEGORY_ORGANIZATION"],
      ["financial_accounts", "account_id", "INVALID_ACCOUNT_ORGANIZATION"],
      ["clients", "client_id", "INVALID_CLIENT_ORGANIZATION"],
      ["processes", "process_id", "INVALID_PROCESS_ORGANIZATION"],
    ];

    for (const [table, field, error] of links) {
      assert.match(
        migration,
        new RegExp(
          `NEW\\.${field} IS NOT NULL[\\s\\S]*?FROM public\\.${table}[\\s\\S]*?id = NEW\\.${field}[\\s\\S]*?organization_id = NEW\\.organization_id[\\s\\S]*?RAISE EXCEPTION '${error}'`,
        ),
      );
    }
  });

  test("permite vínculos nulos explicitamente", () => {
    for (const field of ["category_id", "account_id", "client_id", "process_id"])
      assert.match(migration, new RegExp(`IF NEW\\.${field} IS NOT NULL AND NOT EXISTS`));
  });

  test("valida a ordem das datas da recorrência", () => {
    assert.match(migration, /NEW\.end_date < NEW\.start_date/);
    assert.match(migration, /NEW\.next_run_date < NEW\.start_date/);
    assert.match(migration, /NEW\.next_run_date > NEW\.end_date/);
    assert.match(migration, /NEW\.status <> 'finished'/);
  });

  test("restringe a função privilegiada ao uso pelo trigger", () => {
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = public/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.financial_validate_recurrence_links\(\) FROM PUBLIC, anon, authenticated/,
    );
  });
});
