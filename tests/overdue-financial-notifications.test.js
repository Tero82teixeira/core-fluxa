import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824210000_overdue_financial_notifications.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/030_overdue_financial_notifications.sql",
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
const docs = readFileSync("docs/scheduled-automations.md", "utf8");

test("open receivables and payables use civil overdue stages", () => {
  assert.match(migration, /FROM public\.financial_transactions AS financial/);
  assert.match(migration, /financial\.status IN \('pending', 'partial', 'overdue'\)/);
  assert.match(migration, /financial\.due_date </);
  assert.match(migration, /financial\.overdue_days >= 30 THEN 3/);
  assert.match(migration, /financial\.overdue_days >= 7 THEN 2/);
  assert.match(migration, /financial\.overdue_days >= 1/);
  assert.match(migration, /financial\.archived_at IS NULL/);
  assert.match(migration, /financial\.open_balance > 0/);
  assert.match(migration, /transaction_payment\.reversed_at IS NULL/);
});

test("financial dates use the organization timezone and safe fallback", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /now\(\) AT TIME ZONE config\.timezone_name/);
  assert.match(pgTap, /SET LOCAL TIME ZONE 'America\/Sao_Paulo'/);
});

test("recipients are active, finance-authorized and tenant-scoped", () => {
  assert.match(migration, /member\.user_id = monitoring_state\.assigned_to/);
  assert.match(migration, /member\.user_id = financial\.responsible_user_id/);
  assert.match(migration, /member\.organization_id = financial\.organization_id/);
  assert.match(
    migration,
    /'superadmin', 'proprietario', 'administrador', 'gestor'/,
  );
  assert.match(migration, /financial\.responsible_id IS NULL/);
  assert.match(migration, /financial\.notice_stage >= 2/);
  assert.match(
    migration,
    /manager\.role::text IN \([\s\S]*'superadmin', 'proprietario', 'administrador'/,
  );
  assert.match(migration, /\n    UNION\n/);
  assert.doesNotMatch(migration, /\n    UNION ALL\n/);
});

test("settings and critical monitoring prevent duplicate financial alerts", () => {
  assert.match(migration, /notification_preferences->>'overdue_accounts'/);
  assert.match(migration, /settings\.monitoring_show_financial, true/);
  assert.match(migration, /NOT IN \('resolvido', 'ignorado'\)/);
  assert.match(migration, /FROM public\.operational_monitoring_alerts AS alert/);
  assert.match(migration, /alert\.source_type = 'financeiro'/);
  assert.match(migration, /alert\.source_id = financial\.transaction_id/);
  assert.match(migration, /preferences->>'critical_monitoring'/);
});

test("each due date, stage and recipient is idempotent", () => {
  assert.match(
    migration,
    /'overdue-financial:' \|\| financial\.transaction_id::text/,
  );
  assert.match(migration, /financial\.due_date::text/);
  assert.match(migration, /financial\.notice_stage::text/);
  assert.match(migration, /financial\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("the private scan only notifies and reuses the existing clock", () => {
  for (const existingStage of [
    "process_due_scheduled_automations",
    "create_critical_monitoring_notifications",
    "create_unassigned_monitoring_notifications",
    "create_deadline_reminder_notifications",
    "create_overdue_task_escalation_notifications",
    "create_stale_process_notifications",
    "create_overdue_communication_notifications",
    "create_expired_document_notifications",
  ]) {
    assert.match(migration, new RegExp(`${existingStage}\\(\\)`));
  }
  assert.match(
    migration,
    /overdue_financial_count :=[\s\S]*create_overdue_financial_notifications\(\)/,
  );
  assert.match(migration, /OVERDUE_FINANCIAL_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.tasks|UPDATE public\.financial_transactions/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_overdue_financial_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_overdue_financial_notifications\(\)[\s\S]*TO postgres/,
  );
});

test("settings, types and documentation expose overdue accounts", () => {
  assert.match(settings, /overdue_accounts: true/);
  assert.match(settingsPage, /"overdue_accounts", "Contas vencidas"/);
  assert.match(databaseTypes, /create_overdue_financial_notifications:/);
  assert.match(docs, /Avisos de contas vencidas/);
});
