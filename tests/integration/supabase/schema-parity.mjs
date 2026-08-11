import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../../", import.meta.url).pathname;
const walk = (directory, suffix) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path, suffix) : entry.name.endsWith(suffix) ? [path] : [];
});
const sourceFiles = walk(join(root, "src"), ".ts").concat(walk(join(root, "src"), ".tsx"));
const sources = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const migrations = walk(join(root, "supabase/migrations"), ".sql")
  .sort()
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const types = readFileSync(join(root, "src/integrations/supabase/types.ts"), "utf8");

const collect = (text, expression) => new Set([...text.matchAll(expression)].map((match) => match[1]));
const frontendTables = collect(sources, /\.from\(\s*["'`]([a-z][a-z0-9_]*)["'`]\s*\)/g);
const frontendRpcs = collect(sources, /\.rpc\(\s*["'`]([a-z][a-z0-9_]*)["'`]/g);
const migrationTables = collect(migrations, /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z][a-z0-9_]*)"?/gi);
const migrationRpcs = collect(migrations, /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z][a-z0-9_]*)"?\s*\(/gi);
const typedTablesBlock = types.match(/Tables:\s*\{([\s\S]*?)\n\s*Views:\s*\{/i)?.[1] ?? "";
const typedViewsBlock = types.match(/Views:\s*\{([\s\S]*?)\n\s*Functions:\s*\{/i)?.[1] ?? "";
const typedFunctionsBlock = types.match(/Functions:\s*\{([\s\S]*?)\n\s*Enums:\s*\{/i)?.[1] ?? "";
const typedTables = collect(typedTablesBlock, /^\s{6}([a-z][a-z0-9_]*):\s*\{/gm);
for (const view of collect(typedViewsBlock, /^\s{6}([a-z][a-z0-9_]*):\s*\{/gm)) typedTables.add(view);
const typedRpcs = collect(typedFunctionsBlock, /^\s{6}([a-z][a-z0-9_]*):\s*(?:\{|never)/gm);
const missing = (expected, actual) => [...expected].filter((name) => !actual.has(name)).sort();

const report = {
  frontend: { tablesAndViews: [...frontendTables].sort(), rpcs: [...frontendRpcs].sort() },
  missingInMigrations: { tablesAndViews: missing(frontendTables, migrationTables), rpcs: missing(frontendRpcs, migrationRpcs) },
  missingInGeneratedTypes: { tablesAndViews: missing(frontendTables, typedTables), rpcs: missing(frontendRpcs, typedRpcs) },
};
console.log(JSON.stringify(report, null, 2));
const differences = Object.values(report.missingInMigrations).flat().length + Object.values(report.missingInGeneratedTypes).flat().length;
if (differences) {
  console.error(`Schema parity failed with ${differences} relevant difference(s).`);
  process.exitCode = 1;
} else {
  console.log("Schema parity passed: frontend literals are represented in migrations and generated types.");
}
