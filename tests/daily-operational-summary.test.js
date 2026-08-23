import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260823160000_daily_operational_summary.sql",
  "utf8",
);
const polishMigration = readFileSync(
  "supabase/migrations/20260823190000_polish_daily_operational_summary.sql",
  "utf8",
);
const frontend = readFileSync("src/lib/automations.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/automacoes.tsx", "utf8");
const databaseTypes = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("daily summary reuses monitoring with tenant-derived recipients", () => {
  const helper = migration.match(
    /CREATE OR REPLACE FUNCTION public\.create_operational_summary_notifications[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(helper);
  assert.match(helper, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(helper, /alert\.organization_id = _organization_id/);
  assert.match(helper, /alert\.monitoring_status NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(helper, /member\.organization_id = _organization_id/);
  assert.match(helper, /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/);
  assert.match(helper, /public\.organization_settings/);
  assert.match(helper, /notification_preferences/);
  assert.match(helper, /ON CONFLICT DO NOTHING/);
  assert.match(helper, /'\/monitoramento'/);
});

test("daily summary helper is private, idempotent, and scheduler-only", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_operational_summary_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_operational_summary_notifications[\s\S]*TO postgres/,
  );
  assert.match(migration, /rule\.action_type = 'send_operational_summary'/);
  assert.match(migration, /OPERATIONAL_SUMMARY_REQUIRES_DAILY_SCHEDULE/);
  assert.match(migration, /'operational-summary:' \|\| _automation_schedule_id/);
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|https?:\/\//i);
  assert.doesNotMatch(migration, /service_role_key|supabase_service/i);
  assert.match(databaseTypes, /create_operational_summary_notifications:/);
});

test("summary action is isolated from event rules and exposed by the scheduled UI", () => {
  assert.match(migration, /'send_operational_summary'/);
  assert.match(migration, /INVALID_OPERATIONAL_SUMMARY/);
  assert.match(migration, /schedule_record\.action_type = 'send_operational_summary'/);
  assert.match(frontend, /SCHEDULED_AUTOMATION_ACTIONS[\s\S]*"send_operational_summary"/);
  const eventActions = frontend.match(
    /export const AUTOMATION_ACTIONS = \[([\s\S]*?)\] as const/,
  )?.[1];
  assert.ok(eventActions);
  assert.doesNotMatch(eventActions, /send_operational_summary/);
  assert.match(page, /SCHEDULED_AUTOMATION_ACTIONS\.map/);
  assert.match(page, /disabled=\{form\.action_type === "send_operational_summary"\}/);
  assert.match(page, /Cada responsável recebe somente/);
  assert.match(page, /preferências de Configurações serão respeitadas/);
});

test("daily summary renders professional Portuguese labels", () => {
  assert.match(polishMigration, /summary\.total = 1 THEN 'pendência'/);
  assert.match(polishMigration, /summary\.tasks = 1 THEN 'tarefa'/);
  assert.match(polishMigration, /summary\.processes = 1 THEN 'processo'/);
  assert.match(polishMigration, /summary\.documents = 1 THEN 'documento'/);
  assert.match(polishMigration, /summary\.communications = 1 THEN 'retorno'/);
  assert.match(polishMigration, /summary\.financial = 1 THEN 'conta'/);
  assert.match(polishMigration, /summary\.unassigned = 1/);
  assert.doesNotMatch(polishMigration, /pendência\(s\)|item\(ns\)/);
  assert.match(
    polishMigration,
    /REVOKE ALL ON FUNCTION public\.create_operational_summary_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
});
