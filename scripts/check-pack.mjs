// Checks the contents of the package tarball before it is released.
//
//   npm pack --dry-run --json --ignore-scripts | node scripts/check-pack.mjs
//
// Fails unless the tarball holds exactly EXPECTED_FILES and package.json has no
// lifecycle script. The file list is the only guard that keeps build inputs
// (theme/brand.json, theme/logo-geometry.json, scripts), the sign-off sheets
// (brand/preview-*) and dev dependencies such as lightningcss out of a public
// release that consumers pin by URL, so the list is spelled out file by file.
// The brand files ship (keepia/mail#7, maintainer decision M2): the marks,
// wordmarks, lockups, app icons and favicons, all rights reserved (LICENSE,
// Exceptions).

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The brand files of the package: every file in brand/ except the sign-off
// sheets and their build record (brand/preview-*, brand/manifest.json).
export const BRAND_FILES = [
  'brand/apple-touch-icon.png',
  'brand/apple-touch-icon.svg',
  'brand/favicon-16.png',
  'brand/favicon-32.png',
  'brand/favicon-48.png',
  'brand/favicon.ico',
  'brand/favicon.svg',
  'brand/icon-1024.png',
  'brand/icon-192.png',
  'brand/icon-512.png',
  'brand/icon-maskable-512.png',
  'brand/icon-maskable.svg',
  'brand/keepia-archive-lockup-black.svg',
  'brand/keepia-archive-lockup-dark.svg',
  'brand/keepia-archive-lockup-light.svg',
  'brand/keepia-archive-lockup-stacked-black.svg',
  'brand/keepia-archive-lockup-stacked-dark.svg',
  'brand/keepia-archive-lockup-stacked-light.svg',
  'brand/keepia-archive-lockup-stacked-white.svg',
  'brand/keepia-archive-lockup-white.svg',
  'brand/keepia-docs-lockup-black.svg',
  'brand/keepia-docs-lockup-dark.svg',
  'brand/keepia-docs-lockup-light.svg',
  'brand/keepia-docs-lockup-stacked-black.svg',
  'brand/keepia-docs-lockup-stacked-dark.svg',
  'brand/keepia-docs-lockup-stacked-light.svg',
  'brand/keepia-docs-lockup-stacked-white.svg',
  'brand/keepia-docs-lockup-white.svg',
  'brand/keepia-lockup-black.svg',
  'brand/keepia-lockup-dark.svg',
  'brand/keepia-lockup-light.svg',
  'brand/keepia-lockup-stacked-black.svg',
  'brand/keepia-lockup-stacked-dark.svg',
  'brand/keepia-lockup-stacked-light.svg',
  'brand/keepia-lockup-stacked-white.svg',
  'brand/keepia-lockup-white.svg',
  'brand/keepia-mail-lockup-black.svg',
  'brand/keepia-mail-lockup-dark.svg',
  'brand/keepia-mail-lockup-light.svg',
  'brand/keepia-mail-lockup-stacked-black.svg',
  'brand/keepia-mail-lockup-stacked-dark.svg',
  'brand/keepia-mail-lockup-stacked-light.svg',
  'brand/keepia-mail-lockup-stacked-white.svg',
  'brand/keepia-mail-lockup-white.svg',
  'brand/keepia-mark-black.svg',
  'brand/keepia-mark-teal.svg',
  'brand/keepia-mark-white.svg',
  'brand/keepia-mark.svg',
  'brand/keepia-wordmark-black.svg',
  'brand/keepia-wordmark-dark.svg',
  'brand/keepia-wordmark-light.svg',
  'brand/keepia-wordmark-white.svg',
];

export const EXPECTED_FILES = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  ...BRAND_FILES,
  'fonts/IBMPlexMono-Regular.woff2',
  'fonts/IBMPlexMono-SemiBold.woff2',
  'fonts/IBMPlexSans-Italic.woff2',
  'fonts/IBMPlexSans-Light.woff2',
  'fonts/IBMPlexSans-Regular.woff2',
  'fonts/IBMPlexSans-SemiBold.woff2',
  'fonts/OFL.txt',
  'package.json',
  'theme/_index.scss',
  'theme/keepia-carbon.css',
  'theme/tokens.json',
  'theme/vitepress.css',
];

// Scripts that npm or pnpm run on install or pack. A consumer's pnpm with
// strictDepBuilds would refuse to install a package that has one.
export const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepublish',
  'preprepare',
  'prepare',
  'postprepare',
  'prepack',
  'postpack',
];

// Parses the stdout of `npm pack --dry-run --json` and returns the packed paths.
// Throws when the output is not one pack result with a non-empty file list.
export function parsePackOutput(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`npm pack output is not JSON: ${err.message}`);
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`expected exactly one pack result, got ${Array.isArray(data) ? data.length : typeof data}`);
  }
  const { files } = data[0] ?? {};
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('pack result has no file list');
  }
  return files.map((f) => {
    if (typeof f?.path !== 'string' || f.path === '') throw new Error('pack result has a file without a path');
    return f.path;
  });
}

// Compares the packed paths with the expected list. Returns a list of problems;
// an empty list means the tarball is right.
export function checkFiles(actual, expected = EXPECTED_FILES) {
  if (expected.length === 0) return ['the expected file list is empty'];
  const problems = [];
  const want = new Set(expected);
  const seen = new Set();
  for (const p of actual) {
    if (seen.has(p)) problems.push(`packed twice: ${p}`);
    seen.add(p);
    if (!want.has(p)) problems.push(`unexpected file in the tarball: ${p}`);
  }
  for (const p of expected) if (!seen.has(p)) problems.push(`missing from the tarball: ${p}`);
  return problems;
}

// Returns a problem for each lifecycle script in the package manifest.
export function checkLifecycleScripts(pkg) {
  const scripts = pkg?.scripts ?? {};
  return LIFECYCLE_SCRIPTS.filter((s) => Object.hasOwn(scripts, s)).map(
    (s) => `package.json has the lifecycle script "${s}"`,
  );
}

// Runs every check. Returns a list of problems.
export function checkPack(packText, pkg, expected = EXPECTED_FILES) {
  let files;
  try {
    files = parsePackOutput(packText);
  } catch (err) {
    return [err.message, ...checkLifecycleScripts(pkg)];
  }
  return [...checkFiles(files, expected), ...checkLifecycleScripts(pkg)];
}

function main() {
  const packText = readFileSync(process.argv[2] ?? 0, 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const problems = checkPack(packText, pkg);
  if (problems.length) {
    for (const p of problems) console.error(`check-pack: ${p}`);
    process.exit(1);
  }
  console.log(`check-pack: ${EXPECTED_FILES.length} files, no lifecycle scripts`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
