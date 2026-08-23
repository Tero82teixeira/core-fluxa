import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260823210000_unassigned_monitoring_alerts.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync(
  "src/routes/_authenticated/configuracoes.tsx",
  "utf8",
);
const databaseTypes = readFileSync(
  "src/integrations/supabase/types.ts",
  "utf8",
);

test("unassigned scan derives tenants and only notifies active administrators", () => {
  const helper = migration.match(
    /CREATE OR REPLACE FUNCTION public\.create_unassigned_monitoring_notifications[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(helper);
  assert.match(helper, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(helper, /settings\.organization_id = alert\.organization_id/);
  assert.match(helper, /notification_preferences->>'unassigned_monitoring'/);
  assert.match(helper, /alert\.monitoring_status NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(helper, /member\.organization_id = alert\.organization_id/);
  assert.match(helper, /manager\.organization_id = alert\.organization_id/);
  assert.match(helper, /manager\.is_active/);
  assert.match(helper, /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/);
  assert.match(helper, /'\/monitoramento'/);
  assert.doesNotMatch(helper, /_organization_id|auth\.uid\(\)/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
});

test("unassigned notifications are stable and can restart after explicit reassignment", () => {
  assert.match(migration, /history\.action = 'responsavel_alterado'/);
  assert.match(migration, /history\.details->'assigned_to' = 'null'::jsonb/);
  assert.match(migration, /alert\.relevant_at::text/);
  assert.match(migration, /'unassigned-monitoring:' \|\| alert\.source_type/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("unassigned scan is isolated inside the existing private clock", () => {
  assert.match(
    migration,
    /scheduled_count := public\.process_due_scheduled_automations\(\)/,
  );
  assert.match(
    migration,
    /critical_count := public\.create_critical_monitoring_notifications\(\)/,
  );
  assert.match(
    migration,
    /unassigned_count := public\.create_unassigned_monitoring_notifications\(\)/,
  );
  assert.match(migration, /UNASSIGNED_MONITORING_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
});

test("preference is visible and private function is represented in types", () => {
  assert.match(settings, /unassigned_monitoring: true/);
  assert.match(settingsPage, /"unassigned_monitoring", "Pendências sem responsável"/);
  assert.match(databaseTypes, /create_unassigned_monitoring_notifications:/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_unassigned_monitoring_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_unassigned_monitoring_notifications\(\)[\s\S]*TO postgres/,
  );
});
