import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const source = walk("src").filter((f) => /\.[jt]sx?$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
const migrations = walk("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(f, "utf8")).join("\n");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

const frontendRpcs = new Set([...source.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));
const schemaRpcs = new Set([...migrations.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]));
const frontendRelations = new Set([...source.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));
const schemaRelations = new Set([...migrations.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]));
const typeRpcs = new Set([...types.matchAll(/^\s{6}([a-z_][a-z0-9_]*):\s*\{/gim)].map((m) => m[1]));

const difference = (left, right) => [...left].filter((item) => !right.has(item)).sort();
const report = {
  frontend: { rpcs: frontendRpcs.size, relations: frontendRelations.size },
  schema: { rpcs: schemaRpcs.size, relations: schemaRelations.size },
  frontendMissingInMigrations: difference(frontendRpcs, schemaRpcs),
  frontendRelationsMissingInMigrations: difference(frontendRelations, schemaRelations),
  frontendRpcsMissingInGeneratedTypes: difference(frontendRpcs, typeRpcs),
  schemaRpcsUnusedByFrontend: difference(schemaRpcs, frontendRpcs),
};
console.log(JSON.stringify(report, null, 2));

// A frontend call without a versioned database object is a deploy-time defect.
assert.deepEqual(report.frontendMissingInMigrations, [], "frontend RPC absent from versioned migrations");
assert.deepEqual(report.frontendRelationsMissingInMigrations, [], "frontend relation absent from versioned migrations");
