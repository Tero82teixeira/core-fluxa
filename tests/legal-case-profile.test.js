import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261020120000_legal_case_profiles.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-legal-cases.ts", "utf8");
const panel = readFileSync("src/components/legal/legal-case-profile-panel.tsx", "utf8");
const processDetail = readFileSync("src/routes/_authenticated/processos.$processId.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("FLUXA Advocacia — cadastro jurídico do processo", () => {
  test("mantém os dados especializados separados do núcleo de processos", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.legal_case_profiles/);
    assert.match(migration, /UNIQUE \(organization_id, process_id\)/);
    assert.match(migration, /REFERENCES public\.processes\(id\) ON DELETE CASCADE/);
  });

  test("protege leitura e escrita por organização, papel e módulo jurídico", () => {
    assert.match(migration, /ALTER TABLE public\.legal_case_profiles ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.legal_case_profiles FROM PUBLIC, anon, authenticated/,
    );
    assert.match(migration, /business_segment = 'legal'/);
    assert.match(migration, /enabled_modules \? 'legal_workspace'/);
    assert.match(migration, /process\.organization_id = _organization_id/);
    assert.doesNotMatch(migration, /GRANT (SELECT|INSERT|UPDATE|DELETE).*legal_case_profiles/);
  });

  test("valida CNJ, área, polo e UF no banco", () => {
    assert.match(migration, /cnj_number ~ '\^\[0-9\]\{20\}\$'/);
    assert.match(migration, /LEGAL_CASE_CNJ_INVALID/);
    assert.match(migration, /LEGAL_CASE_AREA_INVALID/);
    assert.match(migration, /LEGAL_CASE_SIDE_INVALID/);
    assert.match(migration, /LEGAL_CASE_STATE_INVALID/);
  });

  test("oferece formulário jurídico somente para organização de Advocacia", () => {
    assert.match(processDetail, /business_segment === "legal"/);
    assert.match(processDetail, /<LegalCaseProfilePanel/);
    assert.match(panel, /Número CNJ/);
    assert.match(panel, /Próxima audiência/);
    assert.match(panel, /Segredo de justiça/);
  });

  test("usa somente RPCs protegidas e mantém contratos tipados", () => {
    assert.match(hook, /get_legal_case_profile/);
    assert.match(hook, /upsert_legal_case_profile/);
    assert.doesNotMatch(hook, /\.from\("legal_case_profiles"\)/);
    assert.match(types, /legal_case_profiles:/);
    assert.match(types, /get_legal_case_profile:/);
    assert.match(types, /upsert_legal_case_profile:/);
  });
});
