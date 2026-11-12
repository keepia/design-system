// The consumer smoke test (keepia/mail#7, part 5): packs this repository as the release does,
// installs the tarball into an empty project without the network, and uses it there the way
// keepia/mail will: every export resolves, the Sass module compiles through Dart Sass's `pkg:`
// importer with Carbon, and the CSS files parse. This shows that the package installs and works
// before anything is released.
//
// No network: `npm pack` reads the working tree; `npm install --offline` installs the tarball,
// which has no dependencies (the Carbon peer is optional), from a fresh, empty npm cache.
// Carbon for the Sass compile comes from this repository's node_modules.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as sass from 'sass';
import { transform } from 'lightningcss';
import { EXPECTED_FILES } from './check-pack.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = '@keepia/design-system';

// The exports and one file each; `./theme` only under the `sass` condition.
const FILE_EXPORTS = {
  'theme/keepia-carbon.css': 'theme/keepia-carbon.css',
  'theme/vitepress.css': 'theme/vitepress.css',
  'theme/tokens.json': 'theme/tokens.json',
  'fonts/IBMPlexSans-Regular.woff2': 'fonts/IBMPlexSans-Regular.woff2',
  'fonts/IBMPlexMono-SemiBold.woff2': 'fonts/IBMPlexMono-SemiBold.woff2',
  'fonts/OFL.txt': 'fonts/OFL.txt',
  'brand/keepia-mark.svg': 'brand/keepia-mark.svg',
  'brand/keepia-mail-lockup-light.svg': 'brand/keepia-mail-lockup-light.svg',
  'brand/favicon.ico': 'brand/favicon.ico',
  'brand/icon-512.png': 'brand/icon-512.png',
  'package.json': 'package.json',
};

let dir;
let app;
let installed;
let tarball;

const npm = (args, cwd, cache) => execFileSync('npm', [...args, '--cache', cache, '--loglevel=error', '--no-audit', '--no-fund', '--no-update-notifier'], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

// Resolves `specs` from a module inside the consumer project, with Node's ESM resolver and
// require.resolve, under the given extra conditions. Returns { spec: { esm, cjs } }, each a path
// relative to the installed package or an error code.
function resolveInApp(specs, conditions = []) {
  const script = path.join(app, `resolve-${conditions.join('-') || 'default'}.mjs`);
  writeFileSync(script, [
    "import { createRequire } from 'node:module';",
    "import { fileURLToPath } from 'node:url';",
    'const require = createRequire(import.meta.url);',
    'const out = {};',
    `for (const s of ${JSON.stringify(specs)}) {`,
    '  const r = {};',
    '  try { r.esm = fileURLToPath(import.meta.resolve(s)); } catch (e) { r.esm = e.code; }',
    '  try { r.cjs = require.resolve(s); } catch (e) { r.cjs = e.code; }',
    '  out[s] = r;',
    '}',
    'process.stdout.write(JSON.stringify(out));',
  ].join('\n'));
  const out = JSON.parse(execFileSync(process.execPath, [...conditions.map((c) => `--conditions=${c}`), script], { cwd: app, encoding: 'utf8' }));
  const rel = (p) => (p && p.startsWith(installed + path.sep) ? path.relative(installed, p).split(path.sep).join('/') : p);
  return Object.fromEntries(Object.entries(out).map(([s, r]) => [s, { esm: rel(r.esm), cjs: rel(r.cjs) }]));
}

const walk = (d, base = d) => readdirSync(d).flatMap((n) => {
  const p = path.join(d, n);
  return statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
});

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'keepia-consumer-'));
  const cache = path.join(dir, 'npm-cache');
  const dist = path.join(dir, 'dist');
  app = path.join(dir, 'app');
  mkdirSync(dist);
  mkdirSync(app);
  // As the release workflow packs (step "Pack").
  const [result] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', dist], ROOT, cache));
  tarball = path.join(dist, result.filename);
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'consumer', version: '0.0.0', private: true, type: 'module' }));
  npm(['install', '--offline', '--ignore-scripts', tarball], app, cache);
  installed = path.join(app, 'node_modules', ...NAME.split('/'));
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('the tarball is keepia-design-system-<version>.tgz and installs offline as @keepia/design-system, without Carbon', () => {
  assert.equal(path.basename(tarball), `keepia-design-system-${pkg.version}.tgz`);
  assert.ok(existsSync(installed), 'installed under node_modules/@keepia/design-system');
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.name, NAME);
  assert.equal(manifest.version, pkg.version);
  const lock = JSON.parse(readFileSync(path.join(app, 'package-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(lock.packages).filter(Boolean), ['node_modules/@keepia/design-system'], 'no dependency comes along');
  assert.match(lock.packages['node_modules/@keepia/design-system'].integrity, /^sha512-/);
  assert.ok(!existsSync(path.join(app, 'node_modules', '@carbon')), 'the optional Carbon peer is not installed');
});

test('the installed package holds exactly the check-pack list', () => {
  assert.deepEqual(walk(installed).sort(), [...EXPECTED_FILES].sort());
});

test('every export resolves to its file, with import and with require', () => {
  const specs = Object.keys(FILE_EXPORTS).map((s) => `${NAME}/${s}`);
  const got = resolveInApp(specs);
  for (const [sub, file] of Object.entries(FILE_EXPORTS)) {
    assert.deepEqual(got[`${NAME}/${sub}`], { esm: file, cjs: file }, sub);
    assert.ok(existsSync(path.join(installed, file)), file);
  }
  // Every export key of package.json is covered here or by the Sass test below.
  const covered = new Set([...Object.keys(FILE_EXPORTS).map((s) => `./${s}`), './theme']);
  for (const key of Object.keys(pkg.exports)) {
    assert.ok(key.endsWith('/*') ? [...covered].some((c) => c.startsWith(key.slice(0, -1))) : covered.has(key), `export ${key} is not exercised`);
  }
});

test('./theme resolves only under the sass condition; what is not exported does not resolve', () => {
  const plain = resolveInApp([`${NAME}/theme`, `${NAME}/theme/brand.json`, `${NAME}/theme/logo-geometry.json`, `${NAME}/scripts/build.mjs`, `${NAME}/brand/preview-white.png`]);
  assert.deepEqual(plain[`${NAME}/theme`], { esm: 'ERR_PACKAGE_PATH_NOT_EXPORTED', cjs: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  for (const s of ['theme/brand.json', 'theme/logo-geometry.json', 'scripts/build.mjs']) {
    assert.deepEqual(plain[`${NAME}/${s}`], { esm: 'ERR_PACKAGE_PATH_NOT_EXPORTED', cjs: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }, s);
  }
  // brand/* is exported as a pattern, but the sign-off sheets are not in the package.
  assert.equal(plain[`${NAME}/brand/preview-white.png`].cjs, 'MODULE_NOT_FOUND');
  assert.ok(!existsSync(path.join(installed, 'brand/preview-white.png')));
  const withSass = resolveInApp([`${NAME}/theme`], ['sass']);
  assert.deepEqual(withSass[`${NAME}/theme`], { esm: 'theme/_index.scss', cjs: 'theme/_index.scss' });
});

test("Sass: @use 'pkg:@keepia/design-system/theme' compiles with Carbon and gives the token values", () => {
  const tokens = JSON.parse(readFileSync(path.join(installed, 'theme/tokens.json'), 'utf8'));
  const source = [
    "@use 'sass:map';",
    "@use 'pkg:@keepia/design-system/theme' as keepia;",
    "@use '@carbon/styles/scss/theme' with ($theme: keepia.$g100);",
    '.cds--g100 { @include keepia.overrides-dark; --x-interactive: #{map.get(keepia.$g100, interactive)}; --x-background: #{map.get(keepia.$g100, background)}; }',
    '.cds--white { @include keepia.overrides-light; --x-interactive: #{map.get(keepia.$white, interactive)}; }',
  ].join('\n');
  const { css, loadedUrls } = sass.compileString(source, {
    importers: [new sass.NodePackageImporter(app)],
    loadPaths: [path.join(ROOT, 'node_modules')],
    quietDeps: true,
    url: pathToFileURL(path.join(app, 'index.scss')),
  });
  assert.ok(loadedUrls.some((u) => fileURLToPath(u) === path.join(installed, 'theme/_index.scss')), 'the module came from the installed package');
  const block = (sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
  assert.match(block('.cds--g100'), new RegExp(`--cds-interactive: ${tokens.dark.interactive};`));
  assert.match(block('.cds--g100'), new RegExp(`--x-interactive: ${tokens.dark.interactive};`));
  assert.match(block('.cds--g100'), new RegExp(`--x-background: ${tokens.dark.background};`));
  assert.match(block('.cds--white'), new RegExp(`--cds-interactive: ${tokens.light.interactive};`));
  assert.match(block('.cds--white'), new RegExp(`--x-interactive: ${tokens.light.interactive};`));
});

test('the CSS files parse, and the @font-face urls of vitepress.css point to installed fonts', () => {
  for (const file of ['theme/keepia-carbon.css', 'theme/vitepress.css']) {
    const code = readFileSync(path.join(installed, file));
    const { warnings } = transform({ filename: file, code, errorRecovery: false });
    assert.deepEqual(warnings, [], file);
  }
  const vitepress = readFileSync(path.join(installed, 'theme/vitepress.css'), 'utf8');
  const urls = [...vitepress.matchAll(/url\("(\.\.\/fonts\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(urls.length, 6);
  for (const u of urls) assert.ok(existsSync(path.join(installed, 'theme', u)), u);
  const carbon = readFileSync(path.join(installed, 'theme/keepia-carbon.css'), 'utf8');
  assert.match(carbon, /\.cds--g100/);
});

test('the installed manifest has no lifecycle script and requires nothing of the consumer', () => {
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
  for (const s of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(manifest.scripts?.[s], undefined, s);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.engines, undefined);
  assert.deepEqual(manifest.peerDependenciesMeta, { '@carbon/styles': { optional: true } });
  createRequire(path.join(app, 'package.json'))(`${NAME}/theme/tokens.json`);
});
