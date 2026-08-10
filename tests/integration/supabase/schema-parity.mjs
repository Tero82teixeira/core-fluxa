import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const expected = readdirSync("supabase/migrations")
  .filter((file) => /^\d+.*\.sql$/.test(file))
  .map((file) => file.match(/^(\d+)/)?.[1])
  .filter(Boolean)
  .sort();

const output = execFileSync("supabase", ["migration", "list", "--local"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const applied = output
  .split("\n")
  .map((line) => line.match(/^\s*(\d+)\s*\|\s*\1\s*\|/)?.[1])
  .filter(Boolean)
  .sort();

if (new Set(expected).size !== expected.length) {
  throw new Error("Migration filenames contain duplicate versions");
}

if (JSON.stringify(applied) !== JSON.stringify(expected)) {
  const missing = expected.filter((version) => !applied.includes(version));
  const unexpected = applied.filter((version) => !expected.includes(version));
  throw new Error(
    `Local schema is not at migration parity (expected ${expected.length}, applied ${applied.length}; missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"})`,
  );
}

console.log(
  `Schema parity OK: ${applied.length} migrations applied locally; latest ${applied.at(-1)}`,
);
