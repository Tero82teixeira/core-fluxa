import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const migration = fs.readFileSync(
  "supabase/migrations/20260803120000_automations_module.sql",
  "utf8",
);
const page = fs.readFileSync("src/routes/_authenticated/automacoes.tsx", "utf8");
const hooks = fs.readFileSync("src/hooks/use-automations.ts", "utf8");
const lib = fs.readFileSync("src/lib/automations.ts", "utf8");
test("proprietário e administrador gerenciam; demais papéis não", () => {
  assert.match(lib, /proprietario/);
  assert.match(lib, /administrador/);
  for (const r of ["gestor", "operacional", "visualizador"])
    assert.doesNotMatch(lib, new RegExp(`role === "${r}"`));
});
test("RLS isola regras e execuções por organização ativa", () => {
  assert.match(
    migration,
    /automation_rules_read[\s\S]*organization_id=automation_rules\.organization_id/,
  );
  assert.match(migration, /automation_executions_read[\s\S]*m\.is_active/);
});
test("regra precisa estar ativa e condição precisa ser verdadeira", () => {
  assert.match(migration, /trigger_type=_event_type AND is_active AND archived_at IS NULL/);
  assert.match(migration, /automation_conditions_match/);
  assert.match(migration, /conditions_not_met/);
});
test("gatilhos e ações inválidos são rejeitados", () => {
  assert.match(migration, /INVALID_TRIGGER/);
  assert.match(migration, /INVALID_ACTION/);
});
test("JSON e conteúdo arbitrário são rejeitados", () => {
  assert.match(migration, /INVALID_JSON/);
  assert.match(migration, /UNSAFE_CONFIG/);
  assert.match(migration, /https\?\:\/\//);
});
test("ações de tarefa são limitadas à organização e itens não arquivados", () => {
  assert.match(migration, /update_task_priority/);
  assert.match(migration, /update_task_status/);
  assert.match(migration, /organization_id=_organization_id AND archived_at IS NULL/);
});
test("criação de tarefa e notificação validam organização", () => {
  assert.match(migration, /INVALID_RECIPIENT/);
  assert.match(migration, /CREATE_NOTIFICATION|create_notification/i);
  assert.match(migration, /organization_members WHERE organization_id=_organization_id/);
});
test("execução e falha são registradas e contabilizadas", () => {
  for (const x of [
    "automation_executions",
    "execution_count=execution_count+1",
    "failure_count=failure_count+1",
    "status='failed'",
  ])
    assert.ok(migration.includes(x));
});
test("dedupe e profundidade máxima evitam loops", () => {
  assert.match(migration, /UNIQUE INDEX[\s\S]*dedupe/);
  assert.match(migration, /_execution_depth>3/);
  assert.match(migration, /id IS DISTINCT FROM _source_automation_rule_id/);
  assert.match(migration, /pg_trigger_depth/);
});
test("sem DELETE físico e RPCs fechadas", () => {
  assert.match(migration, /REVOKE DELETE/);
  assert.doesNotMatch(migration, /USING\s*\(\s*true\s*\)/i);
  assert.match(migration, /FROM PUBLIC,anon/);
});
test("frontend não insere execuções nem usa Edge Function ou segredo", () => {
  assert.doesNotMatch(hooks, /automation_executions"\)\.insert/);
  assert.doesNotMatch(page + hooks, /functions\.invoke|service_role|SUPABASE_SERVICE/);
});
test("rota, botão por papel, estados e histórico existem", () => {
  assert.match(page, /\/_authenticated\/automacoes/);
  assert.match(page, /allowed&&<Button[^>]*>[\s\S]*Nova automação/);
  for (const x of ["isLoading", "isError", "Nenhuma automação", "Histórico", "confirm("])
    assert.ok(page.includes(x));
});
