#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const committedPath = 'src/integrations/supabase/types.ts';
const generated = spawnSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  { encoding: 'utf8' },
);

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || 'Failed to generate local Supabase types.\n');
  process.exit(generated.status ?? 1);
}

const committed = readFileSync(committedPath, 'utf8');

function namesInSection(source, section, nextSection) {
  const start = source.indexOf(`    ${section}: {`);
  const end = source.indexOf(`    ${nextSection}: {`, start);

  if (start === -1 || end === -1) {
    throw new Error(`Could not read ${section} from generated Supabase types.`);
  }

  return new Set(
    [...source.slice(start, end).matchAll(/^      ([A-Za-z_][A-Za-z0-9_]*):/gm)].map(
      ([, name]) => name,
    ),
  );
}

function compare(section, nextSection, label) {
  const expected = namesInSection(generated.stdout, section, nextSection);
  const actual = namesInSection(committed, section, nextSection);
  return [
    ...[...expected].filter((name) => !actual.has(name)).map((name) => `${label}.${name} missing from committed types`),
    ...[...actual].filter((name) => !expected.has(name)).map((name) => `${label}.${name} absent from local schema`),
  ];
}

const divergences = [
  ...compare('Tables', 'Views', 'table'),
  ...compare('Functions', 'Enums', 'function'),
].sort();

if (divergences.length > 0) {
  console.error(`Schema parity failed with ${divergences.length} divergence(s):`);
  for (const divergence of divergences) console.error(`- ${divergence}`);
  process.exit(1);
}

console.log('Schema parity passed: public tables and functions match committed types.');
