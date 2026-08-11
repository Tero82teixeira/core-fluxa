import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const committedTypesPath = "src/integrations/supabase/types.ts"
const generatedTypesPath = join(tmpdir(), "fluxa-supabase-types.generated.ts")

const normalize = (contents) => contents.replaceAll("\r\n", "\n").trimEnd()

const expected = normalize(
  execFileSync(
    "supabase",
    ["gen", "types", "typescript", "--local", "--schema", "public"],
    { encoding: "utf8" },
  ),
)
const found = normalize(readFileSync(committedTypesPath, "utf8"))

if (expected !== found) {
  writeFileSync(generatedTypesPath, `${expected}\n`)
  process.stderr.write("SCHEMA PARITY: FALHOU\n")
  process.stderr.write(`esperado: tipos gerados pelo schema local em ${generatedTypesPath}\n`)
  process.stderr.write(`encontrado: ${committedTypesPath}\n`)
  process.stderr.write("objetos restantes:\n")

  try {
    execFileSync("diff", ["-u", committedTypesPath, generatedTypesPath], {
      encoding: "utf8",
      stdio: ["ignore", "inherit", "inherit"],
    })
  } catch (error) {
    if (error.status !== 1) throw error
  }

  process.exitCode = 1
} else {
  process.stdout.write("SCHEMA PARITY: PASSOU (0 divergências)\n")
}
