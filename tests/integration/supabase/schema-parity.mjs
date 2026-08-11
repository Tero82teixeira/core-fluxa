import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const checkedIn = readFileSync("src/integrations/supabase/types.ts", "utf8")
const generated = execFileSync(
  "supabase",
  ["gen", "types", "typescript", "--local"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
)

function section(source, name, nextName) {
  const start = source.indexOf(`    ${name}: {`)
  const end = source.indexOf(`    ${nextName}: {`, start)
  if (start < 0 || end < 0) throw new Error(`Unable to read ${name} from generated types`)
  return source.slice(start, end)
}

function names(source, name, nextName) {
  return new Set(
    [...section(source, name, nextName).matchAll(/^      ([a-zA-Z0-9_]+): \{/gm)].map(
      (match) => match[1],
    ),
  )
}

const known = new Set([
  "support_requests",
  "archive_support_request",
  "assign_support_request",
  "create_support_request",
  "update_support_request_status",
])
const differences = []
for (const [name, next] of [["Tables", "Views"], ["Functions", "Enums"]]) {
  const committed = names(checkedIn, name, next)
  const local = names(generated, name, next)
  for (const value of local) if (!committed.has(value)) differences.push(value)
  for (const value of committed) if (!local.has(value)) differences.push(value)
}

const unique = [...new Set(differences)].sort()
const unexpected = unique.filter((name) => !known.has(name))
console.log(`Known schema/type differences: ${unique.filter((name) => known.has(name)).join(", ") || "none"}`)
if (unexpected.length) {
  console.error(`Unexpected schema/type differences: ${unexpected.join(", ")}`)
  process.exit(1)
}
console.log("Schema parity matches the documented baseline.")
