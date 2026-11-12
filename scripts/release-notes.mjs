// Writes the notes of a GitHub release to stdout. Ported from pklnx/design-system
// (keepia/mail#7, part 5).
//
//   node scripts/release-notes.mjs <tag> <tarball>
//
// The header names the install command, the tarball's sha512 integrity (what a
// consumer's pnpm-lock.yaml must show) and the verify commands. Then follows the
// token diff of theme/tokens.json against the previous v* tag, per theme.
// The release workflow runs it before the tag exists, so the previous tag is
// the newest v* tag reachable from the checked-out commit (HEAD).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const THEMES = ['light', 'dark'];
const DEFAULT_REPO = 'keepia/design-system';

export function integrityOf(bytes) {
  return 'sha512-' + createHash('sha512').update(bytes).digest('base64');
}

// Runs git without a shell and returns stdout.
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// The newest v* tag reachable from `rev`, or null for the first release. git
// describe fails with "No names found" when there is no such tag; any other
// git error (a bad revision, no repository, a v* tag that is not reachable) is
// rethrown, so it fails the release instead of producing first-release notes.
export function findPreviousTag(rev = 'HEAD', run = git) {
  try {
    const tag = run(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', rev]).trim();
    return tag || null;
  } catch (err) {
    if (/no names found/i.test(`${err?.stderr ?? ''}\n${err?.message ?? ''}`)) return null;
    throw err;
  }
}

// Added, removed and changed tokens per theme. Each list is sorted by name.
export function diffTokens(previous, current) {
  const diff = {};
  for (const theme of THEMES) {
    const before = previous?.[theme] ?? {};
    const after = current?.[theme] ?? {};
    const added = [];
    const removed = [];
    const changed = [];
    for (const name of Object.keys(after).sort()) {
      if (!Object.hasOwn(before, name)) added.push({ name, value: after[name] });
      else if (before[name] !== after[name]) changed.push({ name, from: before[name], to: after[name] });
    }
    for (const name of Object.keys(before).sort()) {
      if (!Object.hasOwn(after, name)) removed.push({ name, value: before[name] });
    }
    diff[theme] = { added, removed, changed };
  }
  return diff;
}

const THEME_TITLE = { light: 'White (light)', dark: 'G100 (dark)' };

export function renderNotes({ tag, repo = DEFAULT_REPO, tarball, integrity, previousTag, diff, current }) {
  const url = `https://github.com/${repo}/releases/download/${tag}/${tarball}`;
  const lines = [
    '## Install',
    '',
    '```sh',
    `pnpm add ${url}`,
    '```',
    '',
    `Integrity (must match \`${tarball}\` in the consumer's \`pnpm-lock.yaml\`):`,
    '',
    '```',
    integrity,
    '```',
    '',
    '## Verify',
    '',
    '```sh',
    `gh release download ${tag} --repo ${repo}`,
    'sha256sum -c SHA256SUMS   # or: shasum -a 256 -c SHA256SUMS',
    `gh attestation verify ${tarball} --repo ${repo} \\`,
    `  --signer-workflow ${repo}/.github/workflows/release.yml --source-ref refs/heads/main`,
    '```',
    '',
    '## Tokens',
    '',
  ];
  if (!previousTag) {
    const counts = THEMES.map((t) => `${Object.keys(current?.changed?.[t] ?? {}).length} ${THEME_TITLE[t]}`).join(' and ');
    lines.push(`First release, so there is no token diff. The theme overrides ${counts} Carbon tokens (\`changed\` in \`theme/tokens.json\`).`);
    return lines.join('\n') + '\n';
  }
  lines.push(`Changes to \`theme/tokens.json\` since ${previousTag}:`);
  for (const theme of THEMES) {
    const { added, removed, changed } = diff[theme];
    lines.push('', `### ${THEME_TITLE[theme]}`, '');
    if (!added.length && !removed.length && !changed.length) {
      lines.push('No changes.');
      continue;
    }
    for (const t of added) lines.push(`- added \`${t.name}\`: \`${t.value}\``);
    for (const t of removed) lines.push(`- removed \`${t.name}\` (was \`${t.value}\`)`);
    for (const t of changed) lines.push(`- changed \`${t.name}\`: \`${t.from}\` → \`${t.to}\``);
  }
  return lines.join('\n') + '\n';
}

// Builds the notes. `run` runs git; the tests inject it and the tokens path.
export function buildNotes({
  tag,
  tarballPath,
  rev = 'HEAD',
  repo = DEFAULT_REPO,
  tokensPath = new URL('../theme/tokens.json', import.meta.url),
  run = git,
}) {
  const current = JSON.parse(readFileSync(tokensPath, 'utf8'));
  const previousTag = findPreviousTag(rev, run);
  const previous = previousTag ? JSON.parse(run(['show', `${previousTag}:theme/tokens.json`])) : null;
  return renderNotes({
    tag,
    repo,
    tarball: basename(tarballPath),
    integrity: integrityOf(readFileSync(tarballPath)),
    previousTag,
    diff: previous ? diffTokens(previous, current) : null,
    current,
  });
}

function main() {
  const [tag, tarballPath] = process.argv.slice(2);
  if (!tag || !tarballPath) {
    console.error('usage: node scripts/release-notes.mjs <tag> <tarball>');
    process.exit(2);
  }
  process.stdout.write(
    buildNotes({ tag, tarballPath, repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
