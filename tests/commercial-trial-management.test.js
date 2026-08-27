import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260827170000_commercial_trial_management.sql",
  "utf8",
);
const commercial = readFileSync("src/lib/commercial.ts", "utf8");
const hook = readFileSync("src/hooks/use-commercial.ts", "utf8");
const administration = readFileSync(
  "src/routes/_authenticated/administracao.tsx",
  "utf8",
);
const access = readFileSync(
  "src/components/commercial/commercial-access.tsx",
  "utf8",
);
const workspace = readFileSync("src/lib/workspace.tsx", "utf8");
const header = readFileSync("src/components/layout/app-header.tsx", "utf8");
const sidebar = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("organizações existentes permanecem ativas e novos cadastros recebem 14 dias", () => {
  assert.match(migration, /SELECT organization\.id, 'active', 'legacy'/);
  assert.match(migration, /now\(\) \+ interval '14 days'/);
  assert.match(migration, /AFTER INSERT ON public\.organizations/);
  assert.match(migration, /status IN \('trial', 'active', 'suspended', 'cancelled'\)/);
});

test("estado comercial participa do workspace e bloqueia apenas acesso vencido", () => {
  assert.match(workspace, /\.from\("organization_subscriptions"\)/);
  assert.match(workspace, /isCommercialSchemaPending/);
  assert.match(workspace, /resolveCommercialAccess\(commercialProfile, new Date\(commercialClock\)\)/);
  assert.match(commercial, /if \(!profile\) return \{ allowed: true/);
  assert.match(commercial, /end\.getTime\(\) <= now\.getTime\(\)/);
  assert.match(access, /Seu período de teste terminou/);
  assert.match(access, /Seus dados continuam preservados/);
});

test("usuário em teste vê prazo restante sem selo para empresas ativas", () => {
  assert.match(header, /commercialAccess\.reason === "trial"/);
  assert.match(header, /Teste: \{commercialAccess\.daysRemaining\}/);
  assert.match(commercial, /Math\.ceil/);
});

test("administração da plataforma lista e controla empresas sem acesso direto às tabelas", () => {
  assert.match(administration, /Administração da plataforma/);
  assert.match(administration, /usePlatformOrganizations/);
  assert.match(administration, /"activate" \| "extend_trial" \| "suspend"/);
  assert.match(administration, /\+7 dias/);
  assert.match(hook, /list_platform_organizations/);
  assert.match(hook, /manage_platform_organization/);
  assert.match(sidebar, /useIsPlatformAdmin/);
  assert.match(sidebar, /!item\.platformOnly \|\| platformAdmin\.data/);
});

test("RPCs comerciais são privadas, auditadas e protegem a empresa administradora", () => {
  assert.match(migration, /PERFORM public\.assert_platform_admin\(\)/);
  assert.match(migration, /CANNOT_SUSPEND_CURRENT_ADMIN_ORGANIZATION/);
  assert.match(migration, /platform\.subscription\.' \|\| _action/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.platform_admins FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.organization_subscriptions FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.organization_subscriptions TO authenticated/);
  assert.match(migration, /CREATE POLICY organization_subscriptions_member_select/);
});

test("contrato tipado inclui tabelas e funções comerciais", () => {
  for (const name of [
    "organization_subscriptions:",
    "platform_admins:",
    "is_platform_admin:",
    "list_platform_organizations:",
    "manage_platform_organization:",
  ]) {
    assert.match(types, new RegExp(name));
  }
});
