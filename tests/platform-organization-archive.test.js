import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import { canArchivePlatformOrganization } from "../src/lib/platform-billing.ts";

describe("arquivamento de empresas da plataforma", () => {
  test("protege assinaturas com acesso pago e libera somente empresas sem acesso vigente", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");

    assert.equal(canArchivePlatformOrganization(null, now), true);
    assert.equal(canArchivePlatformOrganization({ status: "pending" }, now), true);
    assert.equal(canArchivePlatformOrganization({ status: "active" }, now), false);
    assert.equal(canArchivePlatformOrganization({ status: "past_due" }, now), false);
    assert.equal(
      canArchivePlatformOrganization(
        { status: "canceled", access_until: "2026-09-02T12:00:00.000Z" },
        now,
      ),
      false,
    );
    assert.equal(
      canArchivePlatformOrganization(
        { status: "canceled", access_until: "2026-08-31T12:00:00.000Z" },
        now,
      ),
      true,
    );
  });

  test("backend preserva dados, audita ações e permite restauração", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260901160000_platform_organization_archive.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migration, /set_platform_organization_archived/);
    assert.match(migration, /IF NOT public\.is_platform_admin\(\)/);
    assert.match(migration, /SUBSCRIPTION_ACCESS_STILL_ACTIVE/);
    assert.match(migration, /subscription\.status IN \('active', 'past_due'\)/);
    assert.match(migration, /SET archived_at = now\(\),[\s\S]*commercial_status = 'suspended'/);
    assert.match(migration, /SET archived_at = NULL,[\s\S]*commercial_status = 'suspended'/);
    assert.match(migration, /platform\.organization\.archived/);
    assert.match(migration, /platform\.organization\.restored/);
    assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, service_role/);
    assert.doesNotMatch(migration, /DELETE FROM public\.organizations/);
  });

  test("painel confirma arquivamento, oculta por padrão e oferece restauração", async () => {
    const [route, types, errors] = await Promise.all([
      readFile(
        new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/errors.ts", import.meta.url), "utf8"),
    ]);

    assert.match(route, /set_platform_organization_archived/);
    assert.match(route, /Incluir arquivadas/);
    assert.match(route, /Confirmar arquivamento/);
    assert.match(route, /Restaurar/);
    assert.match(route, /Nenhum cliente,[\s\S]*processo,[\s\S]*documento[\s\S]*será apagado/);
    assert.match(route, /canArchivePlatformOrganization/);
    assert.doesNotMatch(route, /\.delete\(\)/);
    assert.match(types, /set_platform_organization_archived:/);
    assert.match(types, /archived_at: string/);
    assert.match(errors, /subscription_access_still_active/);
  });
});
