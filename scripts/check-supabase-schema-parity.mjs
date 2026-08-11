import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const expected = [
  "support_requests",
  "archive_support_request",
  "assign_support_request",
  "create_support_request",
  "update_support_request_status",
]

const generated = spawnSync(
  "supabase",
  ["gen", "types", "typescript", "--local", "--schema", "public"],
  { encoding: "utf8" },
)

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || generated.stdout)
  process.exit(generated.status ?? 1)
}

const committed = readFileSync("src/integrations/supabase/types.ts", "utf8")

function namesIn(section, source) {
  const start = source.indexOf(`    ${section}: {`)
  const end = source.indexOf("\n    }", start)
  if (start < 0 || end < 0) throw new Error(`Seção ${section} não encontrada`)

  return [...source.slice(start, end).matchAll(/^      ([A-Za-z0-9_]+): \{/gm)].map(
    ([, name]) => name,
  )
}

const sections = ["Tables", "Views", "Functions", "Enums", "CompositeTypes"]
const actual = sections.flatMap((section) => {
  const live = new Set(namesIn(section, generated.stdout))
  const typed = new Set(namesIn(section, committed))
  return [
    ...[...live].filter((name) => !typed.has(name)),
    ...[...typed].filter((name) => !live.has(name)).map((name) => `-${name}`),
  ]
})

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("Schema parity divergiu do baseline conhecido.")
  console.error("Esperado:", expected.join(", "))
  console.error("Encontrado:", actual.join(", ") || "nenhuma divergência")
  process.exit(1)
}

console.log("Schema parity mantém somente as 5 divergências conhecidas:")
for (const name of actual) console.log(`- ${name}`)
