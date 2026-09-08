import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260920120000_communication_response_escalation.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/076_communication_response_escalation.sql",
  "utf8",
);
const settings = readFileSync(
  "src/components/notifications/communication-response-alert-settings.tsx",
  "utf8",
);
const team = readFileSync("src/routes/_authenticated/equipe.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("response reminders use configurable ordered deadlines", () => {
  assert.match(migration, /first_reminder_minutes BETWEEN 5 AND 720/);
  assert.match(migration, /escalation_minutes > first_reminder_minutes/);
  assert.match(migration, /make_interval\(\s*mins => config\.first_reminder_minutes/);
  assert.match(migration, /make_interval\(\s*mins => config\.escalation_minutes/);
  assert.match(settings, /Lembrar responsável após \(minutos\)/);
  assert.match(settings, /Avisar gestão após \(minutos\)/);
});

test("latest client message and waiting status control both alert stages", () => {
  assert.match(migration, /last_message\.source = 'client_portal'/);
  assert.match(migration, /thread\.status::text = 'aguardando_equipe'/);
  assert.match(migration, /_as_of >= thread\.reminder_at/);
  assert.match(migration, /_as_of >= thread\.escalation_at THEN 2 ELSE 1/);
  assert.match(migration, /manager\.role::text IN \('superadmin', 'proprietario', 'administrador', 'gestor'\)/);
});

test("each response episode and stage is idempotent and private", () => {
  assert.match(migration, /thread\.waiting_since AT TIME ZONE 'UTC'/);
  assert.match(migration, /thread\.notice_stage::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /LIMIT 200/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.match(databaseTest, /alert settings and device details are never directly readable/);
});

test("team overview reveals readiness but no push endpoint or key", () => {
  assert.match(migration, /count\(subscription\.id\) FILTER \(WHERE subscription\.is_active\)/);
  assert.match(migration, /count\(subscription\.id\) > 0/);
  assert.doesNotMatch(team, /endpoint|p256dh|auth_key/);
  assert.match(team, /Não configurado/);
  assert.match(team, /Sem aparelho ativo/);
  assert.match(team, /Lembrar de ativar/);
});

test("management RPCs and generated contracts cover settings, status and reminder", () => {
  for (const rpc of [
    "get_communication_response_alert_settings",
    "update_communication_response_alert_settings",
    "list_team_push_status",
    "remind_member_push_activation",
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${rpc}`));
    assert.match(types, new RegExp(`${rpc}:`));
  }
  assert.match(migration, /push-activation-reminder:/);
  assert.match(migration, /current_date::text/);
});
