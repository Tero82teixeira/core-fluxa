import { readdir } from "node:fs/promises";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationNamePattern = /^(\d{14})_.+\.sql$/;
const entries = await readdir(migrationsDirectory, { withFileTypes: true });
const migrationFiles = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();

const invalidNames = [];
const filesByVersion = new Map();

for (const file of migrationFiles) {
  const match = migrationNamePattern.exec(file);
  if (!match) {
    invalidNames.push(file);
    continue;
  }

  const version = match[1];
  const files = filesByVersion.get(version) ?? [];
  files.push(file);
  filesByVersion.set(version, files);
}

const duplicateVersions = [...filesByVersion]
  .filter(([, files]) => files.length > 1)
  .map(([version, files]) => `${version}: ${files.join(", ")}`);

if (invalidNames.length || duplicateVersions.length) {
  if (invalidNames.length) {
    console.error(`Invalid migration names:\n${invalidNames.join("\n")}`);
  }
  if (duplicateVersions.length) {
    console.error(`Duplicate migration versions:\n${duplicateVersions.join("\n")}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${migrationFiles.length} migrations: names and versions are unique.`,
  );
}
