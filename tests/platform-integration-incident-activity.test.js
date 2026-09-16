import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("histórico operacional de incidentes da plataforma", () => {
  test("notas são privadas, limitadas, auditadas e exclusivas da plataforma", async () => {
    const [migration, databaseTest] = await Promise.all([
      readFile(
        new URL(
          "../supabase/migrations/20261015120000_platform_integration_incident_activity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/tests/database/092_platform_integration_incident_activity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    assert.match(
      migration,
      /CREATE TABLE IF NOT EXISTS public\.platform_integration_incident_notes/,
    );
    assert.match(migration, /platform_integration_incident_activity/);
    assert.match(migration, /platform_add_integration_incident_note/);
    assert.match(migration, /char_length\(note\) BETWEEN 2 AND 1000/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.platform_integration_incident_notes/);
    assert.equal(
      migration.match(/auth\.uid\(\) IS NULL OR NOT public\.is_platform_admin\(\)/g)?.length,
      2,
    );
    assert.match(migration, /platform\.integration_incident\.note_added/);
    assert.doesNotMatch(
      migration,
      /message\.content|external_sender|external_recipient|sender_identifier|raw_payload|api_key|access_token/i,
    );
    assert.match(databaseTest, /organization owner cannot add a private platform note/);
    assert.match(databaseTest, /activity combines manual notes with audited status changes/);
    assert.match(databaseTest, /audit metadata does not duplicate private note content/);
  });

  test("interface carrega atividade sob demanda e permite adicionar nota", async () => {
    const [component, hook, route, generatedTypes] = await Promise.all([
      readFile(
        new URL(
          "../src/components/platform/platform-integration-incident-activity-dialog.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/hooks/use-platform-integration-incidents.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8"),
    ]);

    assert.match(component, /Histórico do incidente/);
    assert.match(component, /Nova nota operacional/);
    assert.match(component, /sem credenciais ou conteúdo da empresa/);
    assert.match(component, /maxLength=\{1000\}/);
    assert.match(hook, /platform_integration_incident_activity/);
    assert.match(hook, /platform_add_integration_incident_note/);
    assert.match(route, /PlatformIntegrationIncidentActivityDialog incident=\{incident\}/);
    assert.match(generatedTypes, /platform_integration_incident_notes:/);
    assert.match(generatedTypes, /platform_integration_incident_activity:/);
    assert.match(generatedTypes, /platform_add_integration_incident_note:/);
  });
});
