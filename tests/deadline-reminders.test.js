import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260823220000_deadline_reminders.sql",
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

test("deadline ladder covers the four approved internal sources", () => {
  const helper = migration.match(
    /CREATE OR REPLACE FUNCTION public\.create_deadline_reminder_notifications[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(helper);
  assert.match(helper, /FROM public\.tasks AS task/);
  assert.match(helper, /FROM public\.processes AS process/);
  assert.match(helper, /FROM public\.documents AS document/);
  assert.match(helper, /FROM public\.financial_transactions AS financial/);
  assert.match(helper, /ARRAY\[30, 15, 7, 1\]/);
  assert.match(helper, /notification_preferences->>'deadline_reminders'/);
  assert.match(helper, /monitoring_show_financial/);
  assert.match(helper, /monitoring_show_documents/);
  assert.match(helper, /config\.local_today \+ 30/);
  assert.match(helper, /config\.local_today \+ 31/);
});

test("deadline dates use the organization timezone with a safe fallback", () => {
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names AS zone/);
  assert.match(migration, /ELSE 'America\/Sao_Paulo'/);
  assert.match(migration, /now\(\) AT TIME ZONE config\.timezone_name/);
  assert.match(migration, /task\.due_at AT TIME ZONE config\.timezone_name/);
});

test("recipients remain active, tenant-safe, and finance-authorized", () => {
  assert.match(migration, /member\.organization_id = deadline\.organization_id/);
  assert.match(migration, /member\.user_id = deadline\.responsible_id/);
  assert.match(migration, /member\.is_active/);
  assert.match(
    migration,
    /deadline\.source_type <> 'financeiro'[\s\S]*'superadmin', 'proprietario', 'administrador', 'gestor'/,
  );
  assert.match(migration, /manager\.organization_id = deadline\.organization_id/);
  assert.match(migration, /manager\.role::text IN \('superadmin', 'proprietario', 'administrador'\)/);
});

test("deadline reminders deduplicate and use internal destinations", () => {
  assert.match(migration, /'deadline-reminder:' \|\| reminder\.source_type/);
  assert.match(migration, /reminder\.due_on::text/);
  assert.match(migration, /reminder\.days_until::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  for (const route of ["/tarefas", "/processos", "/documentos", "/financeiro"])
    assert.match(migration, new RegExp(`'${route}'`));
  assert.doesNotMatch(migration, /https?:\/\/|net\.http|service_role_key|anon_key/i);
});

test("deadline scan is private, isolated, and reuses the existing clock", () => {
  assert.match(
    migration,
    /deadline_count := public\.create_deadline_reminder_notifications\(\)/,
  );
  assert.match(migration, /DEADLINE_REMINDER_SCAN_FAILED/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_deadline_reminder_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_deadline_reminder_notifications\(\)[\s\S]*TO postgres/,
  );
});

test("deadline preference is visible and represented in generated types", () => {
  assert.match(settings, /deadline_reminders: true/);
  assert.match(settingsPage, /"deadline_reminders", "Lembretes antecipados de prazo"/);
  assert.match(databaseTypes, /create_deadline_reminder_notifications:/);
});
