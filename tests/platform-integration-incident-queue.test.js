import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("fila de incidentes da administração da plataforma", () => {
  test("consulta e ações são exclusivas do administrador da plataforma", async () => {
    const [migration, databaseTest] = await Promise.all([
      readFile(
        new URL(
          "../supabase/migrations/20261014120000_platform_integration_incident_queue.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/tests/database/091_platform_integration_incident_queue.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.platform_integration_incidents/);
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION public\.platform_manage_integration_incident/,
    );
    assert.equal(
      migration.match(/auth\.uid\(\) IS NULL OR NOT public\.is_platform_admin\(\)/g)?.length,
      2,
    );
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /platform\.integration_incident\.' \|\| _action/);
    assert.match(migration, /FROM PUBLIC, anon, service_role/);
    assert.doesNotMatch(
      migration,
      /message\.content|external_sender|external_recipient|sender_identifier|raw_payload|api_key|access_token/i,
    );
    assert.match(databaseTest, /ordinary organization owners cannot open/);
    assert.match(databaseTest, /real provider recovery closes/);
    assert.match(databaseTest, /platform incident actions are audited/);
  });

  test("interface permite assumir, encerrar, reabrir e consultar o histórico", async () => {
    const [route, hook, generatedTypes] = await Promise.all([
      readFile(
        new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/hooks/use-platform-integration-incidents.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8"),
    ]);

    assert.match(route, /Fila operacional das integrações/);
    assert.match(route, /Incluir encerrados/);
    assert.match(route, /Assumir/);
    assert.match(route, /Encerrar acompanhamento/);
    assert.match(route, /Reabrir/);
    assert.match(route, /Falha ainda ativa/);
    assert.match(hook, /refetchInterval: 60_000/);
    assert.match(hook, /platform_manage_integration_incident/);
    assert.match(generatedTypes, /platform_integration_incidents:/);
    assert.match(generatedTypes, /platform_manage_integration_incident:/);
  });
});
