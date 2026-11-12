// Tests of scripts/check-pack.mjs, ported from pklnx/design-system. The package contents are
// fixed in keepia/mail#7, part 5: the theme, the VitePress theme, the fonts, the notices and
// (maintainer decision M2) the brand files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  BRAND_FILES,
  EXPECTED_FILES,
  LIFECYCLE_SCRIPTS,
  checkFiles,
  checkLifecycleScripts,
  checkPack,
  parsePackOutput,
} from './check-pack.mjs';

// Captured with npm 10.9.9: `npm pack --dry-run --json --ignore-scripts` of this package
// (version 0.1.0), written one file entry per line.
const sample = readFileSync(new URL('./fixtures/pack-dry-run.json', import.meta.url), 'utf8');
const pkg = { name: '@keepia/design-system', scripts: { 'build:all': 'node scripts/build_all.mjs', test: 'node --test' } };
const real = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const packText = (paths) => JSON.stringify([{ name: '@keepia/design-system', files: paths.map((path) => ({ path, size: 1, mode: 420 })) }]);

test('the captured npm pack sample parses to the 67 expected files', () => {
  const files = parsePackOutput(sample);
  assert.equal(files.length, 67);
  assert.equal(EXPECTED_FILES.length, 67);
  assert.deepEqual([...files].sort(), [...EXPECTED_FILES].sort());
  assert.deepEqual(checkPack(sample, pkg), []);
});

test('the package holds the theme, the VitePress theme, the tokens, the fonts, the notices and the brand files', () => {
  const outside = EXPECTED_FILES.filter((p) => !p.startsWith('brand/') && !p.startsWith('fonts/'));
  assert.deepEqual(outside, ['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'theme/_index.scss', 'theme/keepia-carbon.css', 'theme/tokens.json', 'theme/vitepress.css']);
  const fonts = readdirSync(new URL('../fonts/', import.meta.url)).map((f) => `fonts/${f}`).sort();
  assert.deepEqual(EXPECTED_FILES.filter((p) => p.startsWith('fonts/')), fonts, 'every file in fonts/');
});

// M2: the brand files ship, exactly the marks, wordmarks, lockups, app icons and favicons;
// the sign-off sheets and their build record (manifest.json) stay in the repository.
test('exactly the M2 brand list: every file in brand/ except the sign-off sheets and manifest.json', () => {
  const onDisk = readdirSync(new URL('../brand/', import.meta.url)).map((f) => `brand/${f}`).sort();
  const kept = onDisk.filter((p) => /^brand\/preview-/.test(p) || p === 'brand/manifest.json');
  assert.deepEqual(kept, ['brand/manifest.json', 'brand/preview-g100.png', 'brand/preview-g100.svg', 'brand/preview-icons.png', 'brand/preview-icons.svg', 'brand/preview-white.png', 'brand/preview-white.svg']);
  assert.deepEqual([...BRAND_FILES].sort(), onDisk.filter((p) => !kept.includes(p)));
  assert.equal(BRAND_FILES.length, 52);
  assert.deepEqual(EXPECTED_FILES.filter((p) => p.startsWith('brand/')), BRAND_FILES);
});

test('the exact list passes in any order', () => {
  assert.deepEqual(checkFiles([...EXPECTED_FILES].reverse()), []);
  assert.deepEqual(checkPack(packText(EXPECTED_FILES), pkg), []);
});

test('an extra file fails: build inputs, sign-off sheets, scripts, dev dependencies', () => {
  for (const extra of [
    'theme/brand.json', 'theme/logo-geometry.json', 'theme/contrast-report.json',
    'brand/preview-white.png', 'brand/preview-g100.svg', 'brand/manifest.json',
    'scripts/build_all.mjs', 'Makefile', '.gitleaks.toml',
    'node_modules/lightningcss/package.json', 'node_modules/lightningcss/node/index.js',
  ]) {
    assert.deepEqual(checkPack(packText([...EXPECTED_FILES, extra]), pkg), [`unexpected file in the tarball: ${extra}`]);
  }
});

// Review B N5 on keepia/design-system#6: lightningcss (MPL-2.0) is a dev dependency of one test
// and nothing of it ships, so the MPL-2.0 analysis there stays true.
test('lightningcss stays out of the package: no file, no export, no dependency', () => {
  assert.deepEqual(EXPECTED_FILES.filter((p) => /lightningcss|node_modules/i.test(p)), []);
  assert.doesNotMatch(JSON.stringify({ files: real.files, exports: real.exports }), /lightningcss|node_modules/i);
  for (const field of ['dependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']) assert.equal(real[field], undefined, field);
  assert.deepEqual(Object.keys(real.peerDependencies ?? {}), ['@carbon/styles']);
  assert.equal(real.devDependencies.lightningcss, '1.33.0', 'a dev dependency only');
});

test('a missing file fails', () => {
  for (const missing of ['LICENSE', 'fonts/IBMPlexSans-Regular.woff2', 'brand/keepia-mark.svg', 'theme/vitepress.css']) {
    const problems = checkPack(packText(EXPECTED_FILES.filter((p) => p !== missing)), pkg);
    assert.deepEqual(problems, [`missing from the tarball: ${missing}`]);
  }
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
  assert.deepEqual(checkLifecycleScripts(real), []);
  assert.deepEqual(checkLifecycleScripts({}), []);
});

// The manifest a consumer installs (keepia/mail#7, part 5): the exports of the plan, the
// license string of maintainer decision M2, the optional Carbon peer, and no way to publish it
// to the npm registry by accident.
test('package.json: exports, license, peer dependency, private', () => {
  assert.deepEqual(real.exports, {
    './theme/keepia-carbon.css': './theme/keepia-carbon.css',
    './theme/vitepress.css': './theme/vitepress.css',
    './theme': { sass: './theme/_index.scss' },
    './theme/tokens.json': './theme/tokens.json',
    './fonts/*': './fonts/*',
    './brand/*': './brand/*',
    './package.json': './package.json',
  });
  assert.equal(real.license, 'MIT, brand marks excepted');
  assert.match(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'), /^MIT License\n[\s\S]*\nExceptions\n\n1\. Brand assets are not covered by the MIT License above\./);
  assert.deepEqual(real.peerDependencies, { '@carbon/styles': '^1.118.0' });
  assert.deepEqual(real.peerDependenciesMeta, { '@carbon/styles': { optional: true } });
  assert.equal(real.private, true, 'never published to the npm registry, where the name is not ours');
  assert.match(real.version, /^\d+\.\d+\.\d+$/);
  // Every export target is a packed file (or, for a pattern, a packed directory).
  for (const target of Object.values(real.exports).flatMap((t) => (typeof t === 'string' ? [t] : Object.values(t)))) {
    const p = target.replace(/^\.\//, '');
    if (p.endsWith('/*')) assert.ok(EXPECTED_FILES.some((f) => f.startsWith(p.slice(0, -1))), target);
    else assert.ok(EXPECTED_FILES.includes(p), target);
  }
});

// Every dev dependency is pinned to one exact version (README, "Building"; lightningcss and the
// generators' inputs must not move inside a range while the lockfile still satisfies it).
test('every devDependency in package.json is an exact version', () => {
  const deps = Object.entries(real.devDependencies ?? {});
  assert.ok(deps.length >= 10, `only ${deps.length} devDependencies`);
  const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  assert.deepEqual(deps.filter(([, v]) => !EXACT.test(v)).map(([n, v]) => `${n}@${v}`), []);
  for (const bad of ['^1.33.0', '~1.33.0', '1.33', '>=1.33.0', '1.33.x', '*', 'latest']) assert.ok(!EXACT.test(bad), bad);
  assert.equal(real.dependencies, undefined, 'the package has no dependencies of its own');
});
