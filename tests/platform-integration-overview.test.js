import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("visão consolidada das integrações da plataforma", () => {
  test("RPC é exclusiva da plataforma e não expõe conteúdo sensível", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20261013120000_platform_integration_overview.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.platform_integration_overview/);
    assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_platform_admin\(\)/);
    assert.match(migration, /PLATFORM_ADMIN_REQUIRED/);
    assert.match(migration, /organization\.archived_at IS NULL/);
    assert.match(migration, /unassigned_incidents/);
    assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, service_role/);
    assert.doesNotMatch(
      migration,
      /sender_identifier|external_sender|external_recipient|message\.content|raw_payload|api_key|access_token/i,
    );
  });

  test("painel prioriza empresas que precisam de ajuda e trata todos os estados", async () => {
    const [route, generatedTypes] = await Promise.all([
      readFile(
        new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8"),
    ]);

    assert.match(route, /Saúde das integrações por empresa/);
    assert.match(route, /platform_integration_overview/);
    assert.match(route, /Sem responsável/);
    assert.match(route, /Todas as empresas estão sem falhas ativas/);
    assert.match(route, /query\.refetch\(\)/);
    assert.doesNotMatch(route, /communication_channel_messages|asaas_charge_jobs/);
    assert.match(generatedTypes, /platform_integration_overview:/);
  });
});
