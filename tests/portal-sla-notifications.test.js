import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260911120000_portal_sla_notifications.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/070_portal_sla_notifications.sql",
  "utf8",
);
const settings = readFileSync("src/lib/organization-settings.ts", "utf8");
const settingsPage = readFileSync("src/routes/_authenticated/configuracoes.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("SLA uses the same priority limits and warns at seventy-five percent", () => {
  for (const interval of ["2 hours", "4 hours", "24 hours", "48 hours"])
    assert.match(migration, new RegExp(`interval '${interval}'`));
  for (const warning of ["90 minutes", "3 hours", "18 hours", "36 hours"])
    assert.match(migration, new RegExp(`interval '${warning}'`));
  assert.match(migration, /_as_of >= thread\.warning_at/);
  assert.match(migration, /_as_of >= thread\.due_at THEN 2 ELSE 1/);
});

test("only a latest client message in a shared waiting conversation is eligible", () => {
  assert.match(migration, /client_portal_communication_shares AS share/);
  assert.match(migration, /share\.is_shared/);
  assert.match(migration, /last_message\.source = 'client_portal'/);
  assert.match(migration, /thread\.status::text = 'aguardando_equipe'/);
  assert.match(migration, /thread\.archived_at IS NULL/);
  assert.match(pgTap, /latest company reply prevents a false SLA alert/);
});

test("responsible receives warning and management receives escalation", () => {
  assert.match(migration, /thread\.responsible_id IS NOT NULL/);
  assert.match(migration, /thread\.responsible_id IS NULL[\s\S]*thread\.notice_stage = 2/);
  assert.match(migration, /'superadmin', 'proprietario', 'administrador', 'gestor'/);
  assert.match(migration, /\n    UNION\n/);
  assert.doesNotMatch(migration, /\n    UNION ALL\n/);
});

test("each client-message episode, stage and recipient is idempotent", () => {
  assert.match(migration, /'portal-sla:' \|\| thread\.thread_id::text/);
  assert.match(migration, /thread\.waiting_since AT TIME ZONE 'UTC'/);
  assert.match(migration, /thread\.notice_stage::text/);
  assert.match(migration, /thread\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /NOT EXISTS \([\s\S]*FROM public\.notifications AS existing/);
  assert.match(migration, /LIMIT 200/);
});

test("private helper reuses and preserves the single temporal clock", () => {
  for (const stage of [
    "process_due_scheduled_automations",
    "suspend_expired_kiwify_subscriptions",
    "create_weekly_productivity_report_notifications",
    "create_daily_operational_close_notifications",
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
    "create_portal_sla_notifications",
    "create_expired_document_notifications",
    "create_overdue_financial_notifications",
  ]) assert.match(migration, new RegExp(`${stage}\\(`));
  assert.match(migration, /PORTAL_SLA_SCAN_FAILED/);
  assert.match(migration, /portal_sla_notifications_created/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /TO postgres/);
});

test("preference, generated contract and documentation expose SLA alerts", () => {
  assert.match(settings, /portal_sla_alerts: true/);
  assert.match(settingsPage, /"portal_sla_alerts", "SLA do Portal do Cliente"/);
  assert.match(types, /create_portal_sla_notifications:/);
  assert.match(docs, /Alertas de SLA do Portal do Cliente/);
});
