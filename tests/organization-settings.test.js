import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lib = readFileSync("src/lib/organization-settings.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260810120000_organization_settings_admin.sql",
  "utf8",
);
const monitoring = readFileSync(
  "supabase/migrations/20260810121000_monitoring_organization_settings.sql",
  "utf8",
);

test("defaults regionais e operacionais são seguros", () => {
  assert.match(lib, /America\/Sao_Paulo/);
  assert.match(lib, /currency: "BRL"/);
  assert.match(lib, /stale_process_days: 14/);
});
test("threshold crítico precisa superar o alto", () =>
  assert.match(lib, /critical_threshold <= value\.monitoring_financial_high_threshold/));
test("RPCs validam membro, papéis e IDs relacionados", () => {
  assert.match(migration, /is_org_member\(_organization_id\)/);
  assert.match(migration, /superadmin','proprietario','administrador/);
  assert.match(migration, /SETTINGS_RELATED_ID_ORG_MISMATCH/g);
});
test("RLS e privilégios não permitem escrita direta ou anon", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE/);
  assert.match(migration, /FROM PUBLIC,anon/);
  assert.match(migration, /TO authenticated/);
});
test("atualizações são auditadas por chave", () => {
  assert.match(migration, /jsonb_each\(_changes\)/);
  assert.match(migration, /'old_value'/);
  assert.match(migration, /'new_value'/);
});
test("monitoramento usa configuração com fallback", () => {
  for (const fallback of ["50000", "10000", ",14", ",7", ",30"])
    assert.ok(monitoring.includes(fallback));
  assert.match(monitoring, /monitoring_show_financial/);
});
