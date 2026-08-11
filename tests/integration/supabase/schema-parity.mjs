import { readFile } from "node:fs/promises";

const typesPath = new URL("../../../src/integrations/supabase/types.ts", import.meta.url);
const types = await readFile(typesPath, "utf8");
const expected = [
  ["table", "support_requests", /^      support_requests: \{$/m],
  ["function", "archive_support_request", /^      archive_support_request: \{$/m],
  ["function", "assign_support_request", /^      assign_support_request: \{$/m],
  ["function", "create_support_request", /^      create_support_request: \{$/m],
  ["function", "update_support_request_status", /^      update_support_request_status: \{$/m],
];
const missing = expected.filter(([, , pattern]) => !pattern.test(types));
if (missing.length) {
  console.error("Schema parity failed. Missing from generated Database types:");
  for (const [kind, name] of missing) console.error(`- ${kind}: ${name}`);
  process.exitCode = 1;
} else {
  console.log(`Schema parity passed (${expected.length} contracts checked).`);
}
