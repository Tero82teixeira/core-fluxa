import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORGANIZATION_SETTINGS_DEFAULTS,
  formatOptionalDate,
  formatUpcomingDaysLabel,
  getRoleLabel,
  normalizeOrganizationSettings,
} from "../src/lib/organization-settings.ts";

test("label da janela de monitoramento acompanha a configuração com fallback seguro", () => {
  assert.equal(formatUpcomingDaysLabel(1), "Próximo 1 dia");
  assert.equal(formatUpcomingDaysLabel(3), "Próximos 3 dias");
  assert.equal(formatUpcomingDaysLabel(7), "Próximos 7 dias");
  assert.equal(formatUpcomingDaysLabel(undefined), "Próximos 7 dias");
  assert.equal(formatUpcomingDaysLabel("inválido"), "Próximos 7 dias");
});

const lib = readFileSync("src/lib/organization-settings.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260810120000_organization_settings_admin.sql",
  "utf8",
);
const monitoring = readFileSync(
  "supabase/migrations/20260810121000_monitoring_organization_settings.sql",
  "utf8",
);

test("defaults regionais e operacionais são seguros", () => {
  assert.match(lib, /America\/Sao_Paulo/);
  assert.match(lib, /currency: "BRL"/);
  assert.match(lib, /stale_process_days: 14/);
});
test("prioridade normal da comunicação usa o enum real", () => {
  assert.match(lib, /default_communication_priority: "normal"/);
  assert.match(migration, /default_communication_priority public\.communication_priority/);
  assert.match(migration, /default_communication_priority'\),?::public\.communication_priority/);
});
test("prioridade média não é aceita para comunicação", () => {
  const validation = migration.match(
    /default_communication_priority'.+?SETTINGS_COMMUNICATION_PRIORITY_INVALID/,
  )?.[0];
  assert.ok(validation);
  assert.match(validation, /'baixa','normal','alta','urgente'/);
  assert.doesNotMatch(validation, /media/);
});
test("canal inválido é bloqueado no backend", () => {
  assert.match(
    migration,
    /default_communication_channel'.+?NOT IN \('whatsapp','telefone','email','presencial','interno','outro'\).+?SETTINGS_COMMUNICATION_CHANNEL_INVALID/,
  );
});
test("UUID opcional vazio é convertido com segurança em NULL", () => {
  for (const key of [
    "default_responsible_id",
    "default_financial_account_id",
    "default_income_category_id",
    "default_expense_category_id",
  ]) {
    assert.ok(migration.includes(`NULLIF(_changes->>'${key}','')::uuid`));
  }
});
test("prioridades de tarefa e comunicação permanecem independentes", () => {
  assert.match(migration, /default_task_priority public\.priority_level/);
  assert.match(migration, /default_task_priority.+?::priority_level/);
  assert.match(migration, /default_communication_priority public\.communication_priority/);
  assert.doesNotMatch(migration, /default_communication_priority.+?::priority_level/);
});
test("threshold crítico precisa superar o alto", () =>
  assert.match(lib, /critical_threshold <= value\.monitoring_financial_high_threshold/));
test("RPCs validam membro, papéis e IDs relacionados", () => {
  assert.match(migration, /is_org_member\(_organization_id\)/);
  assert.match(migration, /superadmin','proprietario','administrador/);
  assert.match(migration, /SETTINGS_RELATED_ID_ORG_MISMATCH/g);
});
test("RLS e privilégios não permitem escrita direta ou anon", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE/);
  assert.match(migration, /FROM PUBLIC,anon/);
  assert.match(migration, /TO authenticated/);
});
test("atualizações são auditadas por chave", () => {
  assert.match(migration, /jsonb_each\(_changes\)/);
  assert.match(migration, /'old_value'/);
  assert.match(migration, /'new_value'/);
});
test("monitoramento usa configuração com fallback", () => {
  for (const fallback of ["50000", "10000", ",14", ",7", ",30"])
    assert.ok(monitoring.includes(fallback));
  assert.match(monitoring, /monitoring_show_financial/);
});

test("recent_audit undefined não quebra", () => {
  assert.deepEqual(normalizeOrganizationSettings({}).recent_audit, []);
});

test("recent_audit null não quebra", () => {
  assert.deepEqual(normalizeOrganizationSettings({ recent_audit: null }).recent_audit, []);
});

test("notification_preferences undefined usa defaults", () => {
  assert.deepEqual(
    normalizeOrganizationSettings({}).notification_preferences,
    ORGANIZATION_SETTINGS_DEFAULTS.notification_preferences,
  );
  assert.equal(
    ORGANIZATION_SETTINGS_DEFAULTS.notification_preferences.weekly_productivity_report,
    true,
  );
});

test("payload parcial é normalizado", () => {
  const result = normalizeOrganizationSettings({ legal_name: "FLUXA", member_count: 3 });
  assert.equal(result.legal_name, "FLUXA");
  assert.equal(result.member_count, 3);
  assert.equal(result.client_count, 0);
  assert.equal(result.active_process_count, 0);
  assert.equal(result.trade_name, null);
  assert.equal(result.timezone, ORGANIZATION_SETTINGS_DEFAULTS.timezone);
});

test("payload inválido gera erro controlado", () => {
  for (const invalid of [null, [], "settings"])
    assert.throws(
      () => normalizeOrganizationSettings(invalid),
      /Resposta inválida ao carregar as configurações/,
    );
});

test("created_at ausente ou inválido não quebra", () => {
  assert.equal(formatOptionalDate(normalizeOrganizationSettings({}).created_at), "—");
  assert.equal(formatOptionalDate("não é uma data"), "—");
});

test("role desconhecido não quebra", () => {
  assert.equal(getRoleLabel("papel-antigo", { administrador: { label: "Administrador" } }), "—");
});

test("página mantém os dados de um payload completo", () => {
  const payload = {
    organization_id: "org-1",
    legal_name: "FLUXA Tecnologia",
    trade_name: "FLUXA",
    member_count: 4,
    client_count: 20,
    active_process_count: 8,
    created_at: "2026-08-10T12:00:00Z",
    recent_audit: [
      {
        id: "audit-1",
        action: "update",
        metadata: { key: "timezone" },
        created_at: "2026-08-10T12:30:00Z",
        actor_name: "Admin",
      },
    ],
    notification_preferences: { overdue_tasks: false },
    timezone: "UTC",
  };
  const result = normalizeOrganizationSettings(payload);
  assert.equal(result.organization_id, payload.organization_id);
  assert.equal(result.trade_name, payload.trade_name);
  assert.equal(result.timezone, "UTC");
  assert.equal(result.recent_audit[0].id, "audit-1");
  assert.equal(result.notification_preferences.overdue_tasks, false);
  assert.equal(result.notification_preferences.expiring_documents, true);
  assert.equal(result.notification_preferences.weekly_productivity_report, true);
});

test("configurações exibem o relatório semanal de produtividade", () => {
  const route = readFileSync("src/routes/_authenticated/configuracoes.tsx", "utf8");
  assert.match(route, /weekly_productivity_report/);
  assert.match(route, /Relatório semanal de produtividade/);
});
