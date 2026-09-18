import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { matchesPlatformAccessFilter, platformAccessStatus } from "../src/lib/platform-access.ts";

const migration = readFileSync(
  "supabase/migrations/20261016120000_platform_access_tracking.sql",
  "utf8",
);
const workspace = readFileSync("src/lib/workspace.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/administracao-plataforma.tsx", "utf8");

const now = new Date("2026-10-16T12:00:00Z");

test("classifica acesso nunca realizado, recente e inativo", () => {
  assert.equal(platformAccessStatus({ last_access_at: null }, now), "never");
  assert.equal(platformAccessStatus({ last_access_at: "2026-10-16T06:00:00Z" }, now), "active");
  assert.equal(platformAccessStatus({ last_access_at: "2026-10-14T12:00:01Z" }, now), "recent");
  assert.equal(platformAccessStatus({ last_access_at: "2026-10-13T12:00:00Z" }, now), "inactive");
});

test("filtra empresas sem acesso e inativas", () => {
  assert.equal(matchesPlatformAccessFilter({ last_access_at: null }, "never", now), true);
  assert.equal(
    matchesPlatformAccessFilter({ last_access_at: "2026-10-10T12:00:00Z" }, "inactive", now),
    true,
  );
  assert.equal(
    matchesPlatformAccessFilter({ last_access_at: "2026-10-16T08:00:00Z" }, "inactive", now),
    false,
  );
});

test("registro usa sessão autenticada, é deduplicado e aparece no painel", () => {
  assert.match(migration, /auth\.jwt\(\)->>'session_id'/);
  assert.match(migration, /ON CONFLICT \(organization_id, user_id, session_id\) DO UPDATE/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.organization_access_sessions/);
  assert.match(workspace, /record_organization_access/);
  assert.match(route, /Nunca acessaram/);
  assert.match(route, /Inativos há 3\+ dias/);
  assert.match(route, /Primeiro:/);
  assert.match(route, /Último:/);
});
