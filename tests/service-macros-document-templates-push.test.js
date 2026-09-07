import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260918120000_service_macros_document_templates_push.sql",
  "utf8",
);
const communication = readFileSync("src/routes/_authenticated/comunicacao.tsx", "utf8");
const macroPicker = readFileSync(
  "src/components/communication/communication-macro-picker.tsx",
  "utf8",
);
const portalPanel = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const pushHook = readFileSync("src/hooks/use-push-notifications.ts", "utf8");
const pushWorker = readFileSync("public/push-sw.js", "utf8");
const pushFunction = readFileSync("supabase/functions/communication-push/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

test("service macros remain an explicit reviewed action", () => {
  assert.match(migration, /CREATE TABLE public\.communication_macros/);
  assert.match(migration, /MACRO_ACTION_REQUIRED/);
  assert.match(communication, /Macro aplicada\. Revise o rascunho antes de registrar/);
  assert.match(communication, /setContent\(current=>applyQuickReply/);
  assert.doesNotMatch(macroPicker, /add_communication_entry|send|submit/);
});

test("document templates create a bounded atomic batch", () => {
  assert.match(migration, /jsonb_array_length\(items\) BETWEEN 1 AND 20/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_document_requests_from_template/,
  );
  assert.match(migration, /PERFORM public\.create_client_portal_document_request/);
  assert.match(portalPanel, /Criar pelo modelo/);
  assert.match(portalPanel, /applyRequestTemplate\.mutateAsync/);
});

test("push is opt-in, authenticated and limited to the assigned responsible person", () => {
  assert.match(config, /\[functions\.communication-push\][\s\S]*verify_jwt = true/);
  assert.match(pushHook, /Notification\.requestPermission\(\)/);
  assert.match(pushHook, /pushManager\.subscribe/);
  assert.match(migration, /subscription\.user_id = thread_row\.assigned_to/);
  assert.match(migration, /access\.user_id = _actor_id/);
  assert.match(migration, /prepare_communication_push\(uuid, uuid\)[\s\S]*TO service_role/);
  assert.match(
    migration,
    /prepare_communication_push\(uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /portal-message:' \|\| NEW\.id/);
});

test("push notifications contain no message body or secret keys", () => {
  assert.match(migration, /'Nova mensagem de cliente'::text, thread_row\.subject/);
  assert.doesNotMatch(migration, /entry_row\.content/);
  assert.match(pushWorker, /showNotification/);
  assert.doesNotMatch(
    pushFunction,
    /console\.(log|warn|error)\([^\n]*(privateKey|VAPID_PRIVATE_KEY)/,
  );
  assert.match(pushFunction, /auth\.getUser\(token\)/);
  assert.match(pushFunction, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("push failure is best effort and never blocks the client message mutation", () => {
  const clientHook = readFileSync("src/hooks/use-client-portal-communication.ts", "utf8");
  assert.match(clientHook, /void supabase\.functions\.invoke\("communication-push"/);
  assert.match(pushFunction, /DELIVERY_FAILED/);
  assert.match(pushFunction, /return json\(\{ delivered \}\)/);
});
