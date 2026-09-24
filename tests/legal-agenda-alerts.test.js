import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261021120000_legal_agenda_alerts.sql");
const page = read("src/routes/_authenticated/advocacia.agenda-juridica.tsx");
const hook = read("src/hooks/use-legal-cases.ts");
const navigation = read("src/lib/navigation.ts");
const modules = read("src/lib/organization-segments.ts");
const notifications = read("src/lib/notifications.ts");
const notificationPage = read("src/routes/_authenticated/notificacoes.tsx");
const types = read("src/integrations/supabase/types.ts");

describe("FLUXA Advocacia — Agenda Jurídica e alertas", () => {
  test("reúne audiências, prazos e tarefas no módulo jurídico", () => {
    assert.match(page, /useLegalAgenda/);
    assert.match(page, /useProcesses/);
    assert.match(page, /useTasks/);
    assert.match(navigation, /\/advocacia\/agenda-juridica/);
    assert.match(modules, /"\/advocacia\/agenda-juridica": "legal_workspace"/);
  });

  test("protege a consulta por organização, papel e módulo", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.list_legal_agenda/);
    assert.match(migration, /has_org_role/);
    assert.match(migration, /legal_module_enabled\(_organization_id\)/);
    assert.match(migration, /_to > _from \+ interval '62 days'/);
    assert.match(migration, /settings\.business_segment = 'legal'/);
  });

  test("usa o relógio temporal existente, sem criar cron paralelo", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.run_temporal_automation_cycle\(\)/);
    assert.match(migration, /create_health_operational_notifications/);
    assert.match(migration, /create_legal_operational_notifications/);
    assert.doesNotMatch(migration, /cron\.schedule|CREATE EXTENSION.*pg_cron/i);
  });

  test("deduplica alertas, respeita fuso e restringe execução interna", () => {
    assert.match(migration, /legal-hearing:/);
    assert.match(migration, /recipient\.timezone_name/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.create_legal_operational_notifications\(timestamptz\)[\s\S]*authenticated/,
    );
  });

  test("inclui a categoria jurídica e os RPCs nos tipos", () => {
    assert.match(notifications, /"legal"/);
    assert.match(notificationPage, /\["legal", "Advocacia"\]/);
    assert.match(hook, /list_legal_agenda/);
    assert.match(types, /create_legal_operational_notifications/);
    assert.match(types, /list_legal_agenda/);
    assert.match(types, /run_temporal_automation_cycle/);
  });
});
