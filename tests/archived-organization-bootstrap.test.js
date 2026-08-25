import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825000000_block_archived_organization_bootstrap.sql",
  "utf8",
);

test("bootstrap selects memberships only from active organizations", () => {
  assert.match(
    migration,
    /JOIN public\.organizations o ON o\.id = m\.organization_id[\s\S]*o\.archived_at IS NULL[\s\S]*FOR UPDATE OF m/,
  );
});

test("archived membership blocks reactivation and duplicate workspace creation", () => {
  const guard = migration.indexOf("BOOTSTRAP_ORGANIZATION_ARCHIVED");
  const create = migration.indexOf("INSERT INTO public.organizations");
  assert.ok(guard > -1 && guard < create);
  assert.match(
    migration,
    /organization_members m[\s\S]*o\.archived_at IS NOT NULL[\s\S]*BOOTSTRAP_ORGANIZATION_ARCHIVED/,
  );
});

test("bootstrap preserves the reviewed execution grants", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.bootstrap_organization\(\) FROM PUBLIC, anon;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.bootstrap_organization\(\) TO authenticated;/,
  );
});

test("bootstrap qualifies app_role for restricted SQL Editor search paths", () => {
  assert.match(migration, /role public\.app_role/);
  assert.match(migration, /'proprietario'::public\.app_role/);
  assert.doesNotMatch(migration, /(?<!public\.)app_role/);
});
