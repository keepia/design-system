// Tests of scripts/check-pack.mjs, ported from pklnx/design-system. Part 1 of keepia/mail#7
// ships the check with the three files npm always packs; later parts extend EXPECTED_FILES.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPECTED_FILES,
  LIFECYCLE_SCRIPTS,
  checkFiles,
  checkLifecycleScripts,
  checkPack,
  parsePackOutput,
} from './check-pack.mjs';

// Captured with npm 10.9.9: `npm pack --dry-run --json --ignore-scripts` of this package.
const sample = readFileSync(new URL('./fixtures/pack-dry-run.json', import.meta.url), 'utf8');
const pkg = { name: '@keepia/design-system', scripts: { 'build:all': 'node scripts/build_all.mjs', test: 'node --test' } };

const packText = (paths) => JSON.stringify([{ name: '@keepia/design-system', files: paths.map((path) => ({ path, size: 1, mode: 420 })) }]);

test('the expected list is LICENSE, README.md and package.json', () => {
  assert.deepEqual(EXPECTED_FILES, ['LICENSE', 'README.md', 'package.json']);
});

test('the captured npm pack sample parses to the expected files', () => {
  const files = parsePackOutput(sample);
  assert.deepEqual([...files].sort(), [...EXPECTED_FILES].sort());
  assert.deepEqual(checkPack(sample, pkg), []);
});

test('the exact list passes in any order', () => {
  assert.deepEqual(checkFiles([...EXPECTED_FILES].reverse()), []);
  assert.deepEqual(checkPack(packText(EXPECTED_FILES), pkg), []);
});

test('an extra file fails', () => {
  for (const extra of ['theme/brand.json', 'scripts/build_all.mjs', 'Makefile', '.gitleaks.toml']) {
    assert.deepEqual(checkPack(packText([...EXPECTED_FILES, extra]), pkg), [`unexpected file in the tarball: ${extra}`]);
  }
});

test('a missing file fails', () => {
  const problems = checkPack(packText(EXPECTED_FILES.filter((p) => p !== 'LICENSE')), pkg);
  assert.deepEqual(problems, ['missing from the tarball: LICENSE']);
});

test('a file packed twice fails', () => {
  assert.deepEqual(checkFiles([...EXPECTED_FILES, 'LICENSE']), ['packed twice: LICENSE']);
});

test('empty, malformed or ambiguous pack output fails', () => {
  for (const text of ['', 'npm notice', '{}', '[]', '[{}]', '[{"files":[]}]', '[{"files":[{}]}]', packText(['LICENSE']).replace(/^\[/, '[{"files":[{"path":"x"}]},')]) {
    const problems = checkPack(text, pkg);
    assert.ok(problems.length > 0, `accepted: ${JSON.stringify(text)}`);
  }
});

test('an empty expected list fails instead of passing', () => {
  assert.deepEqual(checkFiles([], []), ['the expected file list is empty']);
});

test('every lifecycle script fails', () => {
  for (const s of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) {
    assert.ok(LIFECYCLE_SCRIPTS.includes(s));
    const problems = checkPack(sample, { scripts: { ...pkg.scripts, [s]: 'node x.mjs' } });
    assert.deepEqual(problems, [`package.json has the lifecycle script "${s}"`]);
  }
});

test('the repository package.json has no lifecycle script', () => {
  const real = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkLifecycleScripts(real), []);
  assert.deepEqual(checkLifecycleScripts({}), []);
});
