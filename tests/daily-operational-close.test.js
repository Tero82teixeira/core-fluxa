import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825060000_daily_operational_close.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync(
  "src/routes/_authenticated/configuracoes.tsx",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("automatic close uses local business-hours end and can be disabled", () => {
  assert.match(migration, /settings\.business_hours_end/);
  assert.match(migration, /time '18:00'/);
  assert.match(
    migration,
    /_as_of AT TIME ZONE organization_config\.timezone_name[\s\S]*::time >= organization_config\.business_hours_end/,
  );
  assert.match(
    migration,
    /notification_preferences[\s\S]*->>'daily_operational_close'/,
  );
});

test("scheduled daily summaries suppress the automatic close", () => {
  assert.match(
    migration,
    /NOT EXISTS \([\s\S]*automation_schedules AS schedule[\s\S]*send_operational_summary/,
  );
  assert.match(
    migration,
    /create_operational_summary_notifications\([\s\S]*create_operational_close_for_organization/,
  );
  assert.match(migration, /'operational-summary:'/);
  assert.match(migration, /'operational-close:'/);
});

test("close includes completed, pending, overdue and failed work", () => {
  assert.match(migration, /task\.completed_at/);
  assert.match(migration, /process\.stage::text = 'finalizado'/);
  assert.match(migration, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(migration, /AS pending/);
  assert.match(migration, /AS overdue/);
  assert.match(migration, /FROM public\.automation_executions AS execution/);
  assert.match(migration, /execution\.status = 'failed'/);
  assert.match(migration, /Falhas automáticas:/);
});

test("responsible members get personal numbers and management gets totals", () => {
  assert.match(migration, /personal_stats AS/);
  assert.match(migration, /WHERE NOT member\.is_manager/);
  assert.match(migration, /management_totals AS/);
  assert.match(
    migration,
    /'superadmin', 'proprietario', 'administrador'/,
  );
  assert.match(migration, /alert\.recipient_id = member\.user_id/);
  assert.match(migration, /alert\.recipient_id IS NULL/);
});

test("notifications are internal, daily and idempotent", () => {
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /'monitoring'/);
  assert.match(migration, /'\/monitoramento'/);
  assert.match(
    migration,
    /_dedupe_prefix \|\| ':' \|\| candidate\.user_id::text/,
  );
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /LIMIT 100/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
});

test("helpers remain private and reuse the complete temporal cycle", () => {
  for (const signature of [
    "create_operational_close_for_organization",
    "create_operational_summary_notifications",
    "create_daily_operational_close_notifications",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\(`),
    );
  }
  assert.match(
    migration,
    /daily_operational_close_count :=[\s\S]*create_daily_operational_close_notifications\(\)/,
  );
  assert.match(migration, /DAILY_OPERATIONAL_CLOSE_FAILED/);
  assert.match(
    migration,
    /daily_operational_close_notifications_created/,
  );
  for (const stage of [
    "process_due_scheduled_automations",
    "process_due_financial_recurrences",
    "create_weekly_financial_summary_notifications",
    "create_weekly_data_quality_notifications",
    "create_stale_client_notifications",
    "create_client_birthday_notifications",
    "create_stale_lead_notifications",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
    "create_overdue_task_escalation_notifications",
    "create_stale_task_notifications",
    "create_stale_process_notifications",
    "create_overdue_communication_notifications",
    "create_expired_document_notifications",
    "create_overdue_financial_notifications",
  ]) {
    assert.match(migration, new RegExp(`${stage}\\(\\)`));
  }
});

test("settings, generated types and docs expose the close", () => {
  assert.match(settings, /daily_operational_close: true/);
  assert.match(
    settingsPage,
    /"daily_operational_close", "Fechamento operacional diário"/,
  );
  assert.match(types, /create_daily_operational_close_notifications:/);
  assert.match(types, /create_operational_close_for_organization:/);
  assert.match(docs, /## Fechamento operacional diário/);
  assert.match(docs, /business_hours_end/);
});
