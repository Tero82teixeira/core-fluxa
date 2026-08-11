import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

const TYPES_PATH = "src/integrations/supabase/types.ts"

function normalizeGeneratorMetadata(types) {
  const lines = types.replaceAll("\r\n", "\n").split("\n")
  const metadataStart = lines.findIndex((line) =>
    /^  __InternalSupabase: \{$/.test(line),
  )

  if (metadataStart === -1) return lines.join("\n")

  let depth = 0
  let metadataEnd = -1

  for (let index = metadataStart; index < lines.length; index += 1) {
    depth += (lines[index].match(/\{/g) ?? []).length
    depth -= (lines[index].match(/\}/g) ?? []).length

    if (depth === 0) {
      metadataEnd = index
      break
    }
  }

  if (metadataEnd === -1) {
    throw new Error("Bloco __InternalSupabase inválido nos types do Supabase")
  }

  lines.splice(metadataStart, metadataEnd - metadataStart + 1)
  return lines.join("\n")
}

const generatedTypes = execFileSync(
  "supabase",
  ["gen", "types", "typescript", "--local"],
  { encoding: "utf8" },
)
const committedTypes = readFileSync(TYPES_PATH, "utf8")

const normalizedGeneratedTypes = normalizeGeneratorMetadata(generatedTypes)
const normalizedCommittedTypes = normalizeGeneratorMetadata(committedTypes)

if (normalizedGeneratedTypes !== normalizedCommittedTypes) {
  const comparisonId = randomUUID()
  const generatedPath = join(tmpdir(), `supabase-generated-${comparisonId}.ts`)
  const committedPath = join(tmpdir(), `supabase-committed-${comparisonId}.ts`)

  try {
    writeFileSync(generatedPath, normalizedGeneratedTypes)
    writeFileSync(committedPath, normalizedCommittedTypes)
    const diff = spawnSync(
      "git",
      ["diff", "--no-index", "--", committedPath, generatedPath],
      { encoding: "utf8" },
    )

    process.stderr.write(diff.stdout)
    process.stderr.write(diff.stderr)
  } finally {
    rmSync(generatedPath, { force: true })
    rmSync(committedPath, { force: true })
  }

  console.error(
    "Schema parity falhou: os types gerados diferem dos types comprometidos.",
  )
  process.exit(1)
}

console.log("Schema parity passou: 0 divergências de schema.")
