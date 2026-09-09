import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260922120000_portal_self_service_channels_analytics.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/077_portal_self_service_channels.sql",
  "utf8",
);
const sendFunction = readFileSync("supabase/functions/communication-channel-send/index.ts", "utf8");
const webhookFunction = readFileSync(
  "supabase/functions/communication-channel-webhook/index.ts",
  "utf8",
);
const portal = readFileSync("src/components/client-portal/portal-faq.tsx", "utf8");
const settings = readFileSync(
  "src/components/communication/channel-connections-settings.tsx",
  "utf8",
);
const report = readFileSync(
  "src/components/communication/communication-service-report.tsx",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("portal FAQ is tenant-scoped, measurable and can escalate to a person", () => {
  assert.match(migration, /client_portal_faq_articles/);
  assert.match(migration, /access\.user_id = auth\.uid\(\)/);
  assert.match(migration, /FAQ_EVENT_RATE_LIMIT/);
  assert.match(portal, /Ainda preciso de ajuda/);
  assert.match(portal, /onEscalate/);
  assert.match(databaseTest, /portal user sees published content from their own organization/);
});

test("official channels keep provider credentials outside the browser and database", () => {
  for (const secret of [
    "META_WHATSAPP_ACCESS_TOKEN",
    "META_WHATSAPP_APP_SECRET",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SECRET",
  ]) {
    assert.match(`${sendFunction}\n${webhookFunction}`, new RegExp(secret));
    assert.doesNotMatch(`${migration}\n${settings}`, new RegExp(secret));
  }
  assert.match(sendFunction, /auth\.getUser\(token\)/);
  assert.match(webhookFunction, /x-hub-signature-256/);
  assert.match(webhookFunction, /svix-signature/);
  assert.match(migration, /UNIQUE \(connection_id, external_message_id\)/);
});

test("channel service RPCs are restricted and unmatched inbound messages are recoverable", () => {
  assert.match(migration, /public\.prepare_communication_channel_send\(uuid, text, uuid\)/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /status = 'pending_match'/);
  assert.match(migration, /match_communication_channel_message/);
  assert.match(databaseTest, /service-only channel RPCs are not callable by authenticated users/);
});

test("management report combines service, channel and FAQ outcomes", () => {
  for (const metric of [
    "average_first_response_minutes",
    "faq_deflection_rate",
    "channel_pending_match",
  ]) {
    assert.match(migration, new RegExp(metric));
    assert.match(report, new RegExp(metric));
  }
});

test("generated contracts cover every new public RPC", () => {
  for (const rpc of [
    "list_client_portal_faq_articles",
    "save_client_portal_faq_article",
    "list_my_client_portal_faq_articles",
    "record_my_client_portal_faq_event",
    "list_communication_channel_connections",
    "save_communication_channel_connection",
    "prepare_communication_channel_send",
    "complete_communication_channel_send",
    "ingest_communication_channel_message",
    "list_unmatched_communication_channel_messages",
    "match_communication_channel_message",
    "communication_service_metrics",
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${rpc}`));
    assert.match(types, new RegExp(`${rpc}:`));
  }
});
