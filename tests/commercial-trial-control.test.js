import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260828120000_commercial_trial_control.sql",
  "utf8",
);
const workspace = readFileSync("src/lib/workspace.tsx", "utf8");
const authenticatedLayout = readFileSync("src/routes/_authenticated.tsx", "utf8");
const administration = readFileSync(
  "src/routes/_authenticated/administracao-plataforma.tsx",
  "utf8",
);
const header = readFileSync("src/components/layout/app-header.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("empresas existentes ficam ativas e novos cadastros recebem 14 dias", () => {
  assert.match(migration, /UPDATE public\.organizations[\s\S]*commercial_status = 'active'/);
  assert.match(migration, /commercial_status SET DEFAULT 'trial'/);
  assert.match(migration, /trial_ends_at SET DEFAULT \(now\(\) \+ interval '14 days'\)/);
});

test("situação vencida ou suspensa bloqueia o workspace", () => {
  assert.match(migration, /organization_has_commercial_access/);
  assert.match(migration, /trial_ends_at > now\(\)/);
  assert.match(authenticatedLayout, /!commercialAccess/);
  assert.match(authenticatedLayout, /CommercialAccessBlocked/);
  assert.match(workspace, /effectiveCommercialStatus/);
  for (const policy of [
    "automation_rules_read",
    "automation_executions_read",
    "automation_schedules_read",
    "notifications_select_own",
    "support_requests_select",
  ]) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS ${policy}`));
  }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.automation_can_manage/);
});

test("prazo restante e assinatura recebem destaque no cabeçalho", () => {
  assert.match(header, /commercialStatus === "trial"/);
  assert.match(header, /Teste grátis/);
  assert.match(header, /\{trialDaysRemaining\}/);
  assert.match(header, /Assinar agora/);
});

test("administração da plataforma é isolada e oferece todas as ações comerciais", () => {
  assert.match(migration, /CREATE TABLE public\.platform_admins/);
  assert.match(migration, /IF NOT public\.is_platform_admin\(\)/);
  assert.match(administration, /platformAdmin/);
  assert.match(administration, /action: "activate"/);
  assert.match(administration, /action: "extend_trial"/);
  assert.match(administration, /action: "suspend"/);
});

test("RPCs administrativos têm privilégio mínimo e tipos versionados", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.platform_organizations\(\) FROM PUBLIC, anon, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.platform_organizations\(\) TO authenticated/,
  );
  assert.match(types, /platform_organizations:/);
  assert.match(types, /update_organization_commercial_status:/);
  assert.match(types, /commercial_status: string/);
});
