import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const checkedTypesPath = "src/integrations/supabase/types.ts"
const generated = spawnSync("supabase", ["gen", "types", "typescript", "--local"], {
  encoding: "utf8",
})

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || generated.stdout)
  process.exit(generated.status ?? 1)
}

const checked = readFileSync(checkedTypesPath, "utf8")

function namesInSection(source, section, nextSection) {
  const start = source.indexOf(`    ${section}: {`)
  const end = source.indexOf(`    ${nextSection}: {`, start)
  if (start < 0 || end < 0) throw new Error(`Could not locate ${section} in Supabase types`)

  return new Set(
    [...source.slice(start, end).matchAll(/^      ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((match) => match[1]),
  )
}

function difference(left, right) {
  return [...left].filter((name) => !right.has(name)).sort()
}

const sections = [
  ["Tables", "Views"],
  ["Functions", "Enums"],
]
let divergent = false

for (const [section, nextSection] of sections) {
  const databaseNames = namesInSection(generated.stdout, section, nextSection)
  const checkedNames = namesInSection(checked, section, nextSection)
  const missing = difference(databaseNames, checkedNames)
  const stale = difference(checkedNames, databaseNames)

  console.log(`${section}: database=${databaseNames.size}, checked=${checkedNames.size}`)
  for (const name of missing) console.error(`MISSING_IN_CHECKED_TYPES ${section}.${name}`)
  for (const name of stale) console.error(`MISSING_IN_DATABASE ${section}.${name}`)
  divergent ||= missing.length > 0 || stale.length > 0
}

if (divergent) {
  console.error(`Schema parity failed for ${checkedTypesPath}. Types were not modified.`)
  process.exit(1)
}

console.log(`Schema parity passed for ${checkedTypesPath}.`)
