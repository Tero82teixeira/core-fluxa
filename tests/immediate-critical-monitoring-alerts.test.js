import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260823200000_immediate_critical_monitoring_alerts.sql",
  "utf8",
);
const databaseTypes = readFileSync(
  "src/integrations/supabase/types.ts",
  "utf8",
);

test("critical scan is tenant-derived, preference-aware, and internal", () => {
  const helper = migration.match(
    /CREATE OR REPLACE FUNCTION public\.create_critical_monitoring_notifications[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(helper);
  assert.match(helper, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(helper, /settings\.organization_id = alert\.organization_id/);
  assert.match(helper, /notification_preferences->>'critical_monitoring'/);
  assert.match(helper, /monitoring_show_financial/);
  assert.match(helper, /monitoring_show_communication/);
  assert.match(helper, /monitoring_show_documents/);
  assert.match(helper, /alert\.monitoring_status NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(helper, /member\.organization_id = alert\.organization_id/);
  assert.match(helper, /manager\.organization_id = alert\.organization_id/);
  assert.match(helper, /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/);
  assert.match(helper, /'\/monitoramento'/);
  assert.doesNotMatch(helper, /_organization_id|auth\.uid\(\)/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
});

test("critical alerts deduplicate an episode and allow a reopened episode", () => {
  assert.match(migration, /history\.action = 'reaberto'/);
  assert.match(migration, /coalesce\(reopen\.reopened_at::text, 'initial'\)/);
  assert.match(migration, /'critical-monitoring:' \|\| alert\.source_type/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("one private cycle preserves the approved fifteen-minute clock", () => {
  assert.match(
    migration,
    /scheduled_count := public\.process_due_scheduled_automations\(\)/,
  );
  assert.match(migration, /EXCEPTION WHEN OTHERS/);
  assert.match(migration, /CRITICAL_MONITORING_SCAN_FAILED/);
  assert.match(migration, /FOR existing_job IN[\s\S]*cron\.unschedule/);
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(migration, /'SELECT public\.run_temporal_automation_cycle\(\);'/);
});

test("critical helpers are postgres-only and represented in generated types", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_critical_monitoring_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.run_temporal_automation_cycle\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_critical_monitoring_notifications\(\)[\s\S]*TO postgres/,
  );
  assert.match(databaseTypes, /create_critical_monitoring_notifications:/);
  assert.match(databaseTypes, /run_temporal_automation_cycle:/);
});
