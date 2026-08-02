import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260803000000_create_test_notification.sql",
  "utf8",
);
const hook = fs.readFileSync("src/hooks/use-notifications.ts", "utf8");
const page = fs.readFileSync("src/routes/_authenticated/notificacoes.tsx", "utf8");

test("proprietário e administrador podem criar a notificação de teste", () => {
  assert.match(migration, /member\.role IN \('proprietario', 'administrador'\)/);
});

for (const role of ["gestor", "operacional", "visualizador"]) {
  test(`${role} não pode criar a notificação de teste`, () => {
    assert.doesNotMatch(migration, new RegExp(`member\\.role IN \\([^)]*${role}`));
  });
}

test("usuário precisa de autenticação e vínculo ativo na organização informada", () => {
  assert.match(migration, /v_actor IS NULL/);
  assert.match(
    migration,
    /member\.organization_id = _organization[\s\S]*member\.user_id = v_actor[\s\S]*member\.is_active/,
  );
});

test("destinatário é exclusivamente auth.uid e não é argumento da RPC", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_test_notification\(_organization uuid\)/,
  );
  assert.match(
    migration,
    /organization_id,[\s\S]*user_id,[\s\S]*VALUES \([\s\S]*_organization,[\s\S]*v_actor,/,
  );
  assert.doesNotMatch(migration, /FUNCTION public\.create_test_notification\([^)]*user_id/);
});

test("URL, título e corpo são valores fixos e seguros do banco", () => {
  assert.match(migration, /'Notificação de teste'/);
  assert.match(migration, /'Esta é uma notificação de teste da FLUXA\./);
  assert.match(migration, /'\/notificacoes'/);
  assert.doesNotMatch(migration, /_(title|body|action_url)\b/);
});

test("dedupe_key é única em cada execução", () => {
  assert.match(migration, /v_notification_id uuid := gen_random_uuid\(\)/);
  assert.match(migration, /'test-notification-' \|\| v_notification_id::text/);
});

test("RPC tem search_path fixo e privilégio somente para authenticated", () => {
  assert.match(migration, /SET search_path = public, pg_temp/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_test_notification\(uuid\) FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_test_notification\(uuid\) TO authenticated/,
  );
});

test("cria audit log ligado à notificação", () => {
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /'notification\.test_created'[\s\S]*v_notification_id/);
});

test("migration não usa exclusão física nem policies irrestritas", () => {
  assert.doesNotMatch(migration, /DELETE FROM/i);
  assert.doesNotMatch(migration, /(USING|WITH CHECK) \(true\)/i);
});

test("botão aparece somente para proprietário e administrador e possui loading", () => {
  assert.match(page, /role === "proprietario" \|\| role === "administrador"/);
  assert.match(page, /\{canCreateTest && \([\s\S]*disabled=\{createTest\.isPending\}/);
  assert.match(page, /Criar\s+notificação de teste/);
});

test("hook invalida Central, contador do sino e cinco recentes", () => {
  assert.match(hook, /invalidateQueries\(\{ queryKey: key\(organizationId\) \}\)/);
  assert.match(
    hook,
    /invalidateQueries\(\{ queryKey: \[\.\.\.key\(organizationId\), "unread-count"\] \}\)/,
  );
  assert.match(hook, /invalidateQueries\(\{ queryKey: \[\.\.\.key\(organizationId\), 5\] \}\)/);
});

test("fluxo usa RPC diretamente e nenhuma Edge Function", () => {
  assert.match(hook, /rpc\("create_test_notification", \{[\s\S]*_organization: organizationId,[\s\S]*\}\)/);
  assert.doesNotMatch(`${hook}\n${page}`, /supabase\.functions|functions\.invoke|edge function/i);
});
