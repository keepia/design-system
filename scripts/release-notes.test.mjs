// Tests of scripts/release-notes.mjs, ported from pklnx/design-system (keepia/mail#7, part 5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNotes, diffTokens, findPreviousTag, integrityOf } from './release-notes.mjs';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const previousTokensText = readFileSync(fixture('tokens-previous.json'), 'utf8');

// sha512 of the three bytes "abc", base64 (openssl dgst -sha512 -binary | openssl base64 -A).
const ABC_INTEGRITY = 'sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==';

function withTarball(fn, name = 'keepia-design-system-0.2.0.tgz') {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-test-'));
  try {
    const path = join(dir, name);
    writeFileSync(path, 'abc');
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// An error shaped like the one execFileSync throws when git exits non-zero.
function gitError(args, stderr) {
  return Object.assign(new Error(`Command failed: git ${args.join(' ')}\n${stderr}`), { status: 128, stderr });
}

// A git stand-in: `describe` answers with `previousTag` (or fails like git does
// without a tag), `show` returns the previous tokens fixture.
function fakeGit(previousTag) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[0] === 'describe') {
      if (!previousTag) throw gitError(args, 'fatal: No names found, cannot describe anything.\n');
      return previousTag + '\n';
    }
    if (args[0] === 'show' && args[1] === `${previousTag}:theme/tokens.json`) return previousTokensText;
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  return { run, calls };
}

test('integrityOf is the sha512 of the bytes, base64', () => {
  assert.equal(integrityOf(Buffer.from('abc')), ABC_INTEGRITY);
});

test('findPreviousTag asks for the newest v* tag reachable from the built commit', () => {
  const { run, calls } = fakeGit('v0.1.0');
  assert.equal(findPreviousTag('0123abc', run), 'v0.1.0');
  assert.equal(findPreviousTag(undefined, run), 'v0.1.0');
  assert.deepEqual(calls, [
    ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', '0123abc'],
    ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'],
  ]);
  assert.equal(findPreviousTag('0123abc', fakeGit(null).run), null);
});

test('findPreviousTag rethrows every git error except "no names found"', () => {
  const failing = (stderr) => (args) => {
    throw gitError(args, stderr);
  };
  for (const stderr of [
    'fatal: Not a valid object name nosuchrev\n',
    "fatal: No tags can describe '9177e6b757b2bee4e2047b876e5091a4de7bc58f'.\nTry --always, or create some tags.\n",
    'fatal: not a git repository (or any of the parent directories): .git\n',
  ]) {
    assert.throws(() => findPreviousTag('HEAD', failing(stderr)), (err) => err.stderr === stderr, stderr);
  }
  const notFound = Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' });
  assert.throws(
    () =>
      findPreviousTag('HEAD', () => {
        throw notFound;
      }),
    (err) => err === notFound,
  );
});

test('findPreviousTag with real git: no tag, a v* tag, a bad revision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-git-'));
  const run = (args) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = () =>
    run(['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'x']);
  try {
    run(['init', '-q']);
    commit();
    run(['-c', 'tag.gpgsign=false', 'tag', 'not-a-release']);
    assert.equal(findPreviousTag('HEAD', run), null);
    run(['-c', 'tag.gpgsign=false', 'tag', 'v0.1.0']);
    commit();
    assert.equal(findPreviousTag('HEAD', run), 'v0.1.0');
    assert.throws(() => findPreviousTag('nosuchrev', run), /Not a valid object name/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diffTokens lists added, removed and changed tokens per theme', () => {
  const diff = diffTokens(JSON.parse(previousTokensText), JSON.parse(readFileSync(fixture('tokens-current.json'), 'utf8')));
  assert.deepEqual(diff.light, {
    added: [{ name: 'new-token', value: '#abcdef' }],
    removed: [{ name: 'old-token', value: '#123456' }],
    changed: [{ name: 'interactive', from: '#009d9a', to: '#007d79' }],
  });
  assert.deepEqual(diff.dark, { added: [], removed: [], changed: [] });
});

test('the first release has the header and no diff', () => {
  const { run, calls } = fakeGit(null);
  const notes = withTarball((tarballPath) =>
    buildNotes({ tag: 'v0.1.0', tarballPath, rev: 'deadbeef', tokensPath: fixture('tokens-current.json'), run }),
  );
  assert.equal(calls.length, 1, 'no git show without a previous tag');
  assert.match(notes, /First release, so there is no token diff\. The theme overrides 2 White \(light\) and 1 G100 \(dark\) Carbon tokens/);
  assert.doesNotMatch(notes, /### /);
});

test('the first release of the real tokens names 20 White and 19 G100 overrides', () => {
  const notes = withTarball((tarballPath) => buildNotes({ tag: 'v0.1.0', tarballPath, run: fakeGit(null).run }), 'keepia-design-system-0.1.0.tgz');
  assert.match(notes, /The theme overrides 20 White \(light\) and 19 G100 \(dark\) Carbon tokens/);
  assert.ok(notes.split('\n').includes('pnpm add https://github.com/keepia/design-system/releases/download/v0.1.0/keepia-design-system-0.1.0.tgz'));
});

test('the header names the install URL, the integrity of the tarball bytes and the verify commands', () => {
  const notes = withTarball((tarballPath) =>
    buildNotes({ tag: 'v0.2.0', tarballPath, tokensPath: fixture('tokens-current.json'), run: fakeGit(null).run }),
  );
  const lines = notes.split('\n');
  assert.ok(lines.includes('pnpm add https://github.com/keepia/design-system/releases/download/v0.2.0/keepia-design-system-0.2.0.tgz'));
  assert.ok(lines.includes(ABC_INTEGRITY));
  assert.ok(lines.includes('gh release download v0.2.0 --repo keepia/design-system'));
  assert.ok(lines.includes('gh attestation verify keepia-design-system-0.2.0.tgz --repo keepia/design-system \\'));
  assert.ok(lines.includes('  --signer-workflow keepia/design-system/.github/workflows/release.yml --source-ref refs/heads/main'));
});

test('a later release lists the token diff against the previous tag', () => {
  const { run, calls } = fakeGit('v0.1.0');
  const notes = withTarball((tarballPath) =>
    buildNotes({ tag: 'v0.2.0', tarballPath, rev: 'cafe1234', tokensPath: fixture('tokens-current.json'), run }),
  );
  assert.deepEqual(calls[0].at(-1), 'cafe1234');
  assert.deepEqual(calls[1], ['show', 'v0.1.0:theme/tokens.json']);
  const tokens = notes.slice(notes.indexOf('## Tokens'));
  assert.equal(
    tokens,
    [
      '## Tokens',
      '',
      'Changes to `theme/tokens.json` since v0.1.0:',
      '',
      '### White (light)',
      '',
      '- added `new-token`: `#abcdef`',
      '- removed `old-token` (was `#123456`)',
      '- changed `interactive`: `#009d9a` → `#007d79`',
      '',
      '### G100 (dark)',
      '',
      'No changes.',
      '',
    ].join('\n'),
  );
});
