// Rules every workflow in .github/workflows follows, ported from pklnx/design-system's
// scripts/workflows.test.mjs (keepia/mail#7, part 1; coordinator decision T4): actions pinned
// by commit SHA with the version in a comment (the same SHA wherever an action is used), npm
// without install scripts, IBM's telemetry off where npm runs, one Node version
// (`.node-version`), checkouts without persisted credentials, read-only permissions. The
// composite action in .github/actions/setup holds the Node and npm prelude and its pin.
// Text-based: no YAML parser is a dependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = '.github/workflows';
const NODE_VERSION = readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim();
const ACTIONS_DIR = '.github/actions';
const SETUP = './.github/actions/setup';
const workflows = readdirSync(path.join(ROOT, DIR)).filter((f) => /\.ya?ml$/.test(f)).sort()
  .map((f) => ({ name: f, text: readFileSync(path.join(ROOT, DIR, f), 'utf8') }));
const actions = readdirSync(path.join(ROOT, ACTIONS_DIR), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => d.name).sort()
  .map((n) => ({ name: `${n}/action.yml`, dir: n, text: readFileSync(path.join(ROOT, ACTIONS_DIR, n, 'action.yml'), 'utf8') }));
const sources = [...workflows, ...actions];
const workflow = (name) => workflows.find((w) => w.name === name).text;

// The jobs of a workflow: { name, text }.
const jobsOf = (text) => {
  const start = text.indexOf('\njobs:\n');
  assert.ok(start >= 0, 'a jobs: section');
  return [...text.slice(start + 7).matchAll(/^ {2}([\w-]+):\n([\s\S]*?)(?=^ {2}[\w-]+:\n|(?![\s\S]))/gm)].map((m) => ({ name: m[1], text: m[2] }));
};

test('the workflows are ci and secrets, the local action is setup', () => {
  assert.deepEqual(workflows.map((w) => w.name), ['ci.yml', 'secrets.yml']);
  assert.deepEqual(actions.map((a) => a.dir), ['setup']);
});

// The required checks of the ruleset are job names; a workflow with a required job has no
// paths filter, so the check runs on every pull request (keepia/mail .claude/rules/ci.md).
test('the required checks check and secret-scan run on every pull request and every push to main', () => {
  for (const [file, job] of [['ci.yml', 'check'], ['secrets.yml', 'secret-scan']]) {
    const text = workflow(file);
    const jobs = jobsOf(text);
    assert.deepEqual(jobs.map((j) => j.name), [job], `${file}: one job, ${job}`);
    assert.match(jobs[0].text, new RegExp(`^ {4}name: ${job}$`, 'm'), `${file}: the check is named ${job}`);
    assert.doesNotMatch(jobs[0].text, /^ {4}if:/m, `${file}: ${job} runs on every event`);
    assert.match(text, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n\n/m, `${file}: push to main and every pull request`);
    assert.doesNotMatch(text, /^\s*paths(?:-ignore)?:/m, `${file}: no paths filter`);
  }
});

test('every action is pinned by commit SHA with its version in a comment', () => {
  for (const w of sources) {
    for (const m of w.text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)) {
      if (m[1].startsWith('./')) {
        assert.ok(existsSync(path.join(ROOT, m[1], 'action.yml')), `${w.name}: local action ${m[1]} exists`);
        assert.equal(m[2], '', `${w.name}: ${m[1]}`);
        continue;
      }
      assert.match(m[1], /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${w.name}: ${m[1]}`);
      assert.match(m[2], /^ # v\d+\.\d+\.\d+$/, `${w.name}: ${m[1]} has no version comment`);
    }
  }
});

// Every occurrence of an action carries the same SHA and the same version comment, so a bump
// cannot be done halfway. actions/checkout and actions/setup-go are repeated per job; the
// shared Node prelude is the one thing that exists once (next test).
test('all occurrences of an action use the same SHA and the same version comment', () => {
  const uses = sources.flatMap((s) => [...s.text.matchAll(/^\s*(?:-\s+)?uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})(.*)$/gm)]
    .map((m) => ({ file: s.name, action: m[1], sha: m[2], comment: m[3] })));
  assert.ok(uses.length > 0, 'pinned uses found');
  const byAction = Map.groupBy(uses, (u) => u.action);
  assert.ok([...byAction.values()].some((list) => list.length > 1), 'at least one action is used more than once (the rule is exercised)');
  for (const [action, list] of byAction) {
    const where = list.map((u) => `${u.file} ${u.sha}${u.comment}`).join(', ');
    assert.equal(new Set(list.map((u) => u.sha)).size, 1, `${action}: occurrences pin different SHAs (${where})`);
    assert.equal(new Set(list.map((u) => u.comment)).size, 1, `${action}: occurrences carry different version comments (${where})`);
  }
});

test('the Node prelude is pinned in the setup action only', () => {
  const setup = actions.find((a) => a.dir === 'setup').text;
  assert.match(setup, /^ {4}- uses: actions\/setup-node@[0-9a-f]{40} # v\d+\.\d+\.\d+$/m, 'setup pins actions/setup-node');
  assert.match(setup, /^\s+using: composite$/m);
  for (const w of workflows) assert.doesNotMatch(w.text, /actions\/setup-node@/, `${w.name}: setup-node outside the setup action`);
  assert.doesNotMatch(setup, /actions\/checkout/, 'the setup action does not check out (the caller does, before it)');
});

test('every job that runs npm checks out first and then uses the setup action', () => {
  let checked = 0;
  for (const w of workflows) {
    for (const job of jobsOf(w.text)) {
      if (!/\bnpm (?:run|test|pack|ci)\b/.test(job.text)) continue;
      checked++;
      const checkout = job.text.search(/uses: actions\/checkout@/);
      const setup = job.text.indexOf(`uses: ${SETUP}\n`);
      assert.ok(checkout >= 0 && setup > checkout, `${w.name} ${job.name}: checkout, then ${SETUP}`);
      assert.match(job.text, /IBM_TELEMETRY_DISABLED: 'true'/, `${w.name} ${job.name}: telemetry`);
    }
  }
  assert.ok(checked > 0, 'at least one job runs npm');
});

test('npm installs without install scripts, with IBM telemetry off, once, in the setup action', () => {
  for (const s of sources) {
    const installs = [...s.text.matchAll(/\bnpm (?:ci|install|i)\b.*$/gm)].map((m) => m[0]);
    for (const line of installs) assert.match(line, /^npm ci --ignore-scripts$/, `${s.name}: ${line}`);
    assert.equal(installs.length, s.name === 'setup/action.yml' ? 1 : 0, `${s.name}: npm ci lines`);
  }
  const setup = actions.find((a) => a.dir === 'setup').text;
  assert.match(setup, /IBM_TELEMETRY_DISABLED: 'true'/, 'setup: telemetry');
  assert.match(setup, /package-manager-cache: false/, 'setup: no dependency cache');
});

// ---- one place for the Node version
test('.node-version holds one Node major', () => {
  assert.match(NODE_VERSION, /^\d+$/);
});

test('the setup-node step reads .node-version and nothing names a Node version', () => {
  const setup = actions.find((a) => a.dir === 'setup');
  const steps = [...setup.text.matchAll(/uses: actions\/setup-node@\S+.*\n((?:\s+.*\n){0,4})/g)];
  assert.equal(steps.length, 1, `${setup.name}: one setup-node step`);
  assert.match(steps[0][1], /^\s+node-version-file: \.node-version$/m, `${setup.name}: setup-node without node-version-file: .node-version`);
  for (const s of sources) assert.doesNotMatch(s.text, /^\s*node-version:/m, `${s.name}: literal node-version`);
});

const readme = () => readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const building = () => {
  const m = /^## Building\n([\s\S]*?)^## /m.exec(readme());
  assert.ok(m, 'README "Building" section');
  return m[1];
};

test('package.json devEngines and the README name the Node major of .node-version', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.devEngines.runtime, { name: 'node', version: `>=${NODE_VERSION}`, onFail: 'warn' });
  assert.equal(pkg.engines, undefined, 'engines would bind consumers of the tarball; devEngines does not');
  assert.match(building(), new RegExp(`^Node ${NODE_VERSION}, as declared in \`\\.node-version\``, 'm'), 'README "Building" names Node and .node-version');
});

// .github/dependabot.yml.
test('dependabot.yml: npm, github-actions and gomod, weekly, with a 14-day cooldown, covering the composite actions', () => {
  const text = readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8');
  assert.match(text, /^version: 2$/m);
  const updates = text.split(/^ {2}- package-ecosystem: /m).slice(1).map((u) => ({ ecosystem: /^[\w-]+/.exec(u)[0], text: u }));
  assert.deepEqual(updates.map((u) => u.ecosystem), ['npm', 'github-actions', 'gomod']);
  for (const u of updates) {
    assert.match(u.text, /^ {4}schedule:\n {6}interval: weekly$/m, `${u.ecosystem}: weekly`);
    assert.match(u.text, /^ {4}cooldown:\n {6}default-days: 14$/m, `${u.ecosystem}: 14-day cooldown`);
  }
  const [npm, ghActions, gomod] = updates;
  assert.match(npm.text, /^ {4}directory: \/$/m);
  assert.match(npm.text, /^ {4}groups:\n {6}npm-dependencies:\n {8}update-types: \[minor, patch\]$/m, 'npm: minor and patch grouped');
  assert.ok(existsSync(path.join(ROOT, 'package.json')) && existsSync(path.join(ROOT, 'package-lock.json')), 'npm: manifest and lockfile at /');
  // Every directory with a local action must match one of the globs; "/" holds the workflows.
  const dirs = [...ghActions.text.matchAll(/^ {6}- (\S+)$/gm)].map((m) => m[1]);
  assert.deepEqual(dirs, ['/', '/.github/actions/*']);
  assert.ok(existsSync(path.join(ROOT, DIR)), 'github-actions: / has .github/workflows');
  assert.ok(actions.length > 0, 'github-actions: the glob matches at least one composite action');
  // gomod: the go.mod the secret scan reads its Go version from, and no other.
  assert.match(gomod.text, /^ {4}directory: \/tools\/gitleaks$/m);
  assert.ok(existsSync(path.join(ROOT, 'tools/gitleaks/go.mod')), 'gomod: /tools/gitleaks holds go.mod');
  assert.ok(!existsSync(path.join(ROOT, 'go.mod')), 'no root go.mod: this is a Node repository');
  const goFiles = [...sources.flatMap((s) => [...s.text.matchAll(/go-version-file: (\S+)$/gm)].map((m) => m[1]))];
  assert.ok(goFiles.length > 0, 'a setup-go step reads a go-version-file');
  for (const f of goFiles) assert.equal(f, 'tools/gitleaks/go.mod');
});

test('every checkout leaves no credentials behind', () => {
  let checked = 0;
  for (const w of sources) {
    for (const m of w.text.matchAll(/uses: actions\/checkout@\S+.*\n((?:\s+.*\n){0,3})/g)) {
      checked++;
      assert.match(m[1], /persist-credentials: false/, `${w.name}: checkout without persist-credentials: false`);
    }
  }
  assert.ok(checked > 0, 'at least one checkout is checked');
});

test('every workflow grants only contents: read, at the top level, and no job asks for more', () => {
  for (const w of workflows) {
    assert.match(w.text, /^permissions:\n {2}contents: read\n(?! {2}\S)/m, `${w.name}: only contents: read at the top level`);
    assert.equal([...w.text.matchAll(/^\s*permissions:/gm)].length, 1, `${w.name}: no job-level permissions`);
  }
});

// ---- one entry point for the generation order
const ciStep = (name) => {
  const text = workflow('ci.yml');
  const start = text.indexOf(`- name: ${name}\n`);
  assert.ok(start >= 0, `CI step "${name}"`);
  const end = text.indexOf('\n      - ', start + 1);
  const run = /run: \|?\s*\n?([\s\S]*)$/.exec(text.slice(start, end < 0 ? undefined : end));
  assert.ok(run, `CI step "${name}" with a run block`);
  return run[1];
};
// The sh blocks of README "Building", as command lines without comments (a whole-line comment
// counts as no command).
const readmeBlocks = () => [...building().matchAll(/```sh\n([\s\S]*?)```/g)]
  .map((m) => m[1].split('\n').map((l) => l.replace(/(?:^|\s+)#.*$/, '').trim()).filter(Boolean));

test('CI and README "Building" call the same entry point and the same install line', () => {
  const ciCommands = ciStep('Generated files are committed').split('\n').map((l) => l.trim()).filter((l) => /^npm run /.test(l));
  assert.deepEqual(ciCommands, ['npm run build:all'], 'CI step "Generated files are committed" runs exactly the entry point');
  assert.match(ciStep('Generated files are committed'), /git status --porcelain[\s\S]*::error::/, 'the drift check stays with its ::error line');
  const [setup] = readmeBlocks();
  assert.ok(setup?.length, 'README "Building" setup block');
  assert.ok(setup.includes('npm ci --ignore-scripts'), 'README installs as the setup action does');
  assert.ok(setup.includes('npm run build:all'), 'README "Building" runs npm run build:all');
  assert.ok(setup.indexOf('npm ci --ignore-scripts') < setup.indexOf('npm run build:all'), 'install before build');
});

test('CI does not call a script directly other than check-pack, only the entry point defines the order', () => {
  for (const w of workflows) {
    assert.doesNotMatch(w.text, /node scripts\/(?!check-pack\.mjs\b)/, `${w.name}: a script called directly`);
  }
});

test('README "Building" lists the steps of scripts/build_all.mjs in its order', async () => {
  const { STEPS, commandOf } = await import('./build_all.mjs');
  const blocks = readmeBlocks();
  assert.equal(blocks.length, 2, 'README "Building": a setup block and a step block');
  assert.deepEqual(blocks[1], STEPS.map(commandOf), 'README step list and STEPS differ in commands or order');
});

// A plain (unquoted) single-line scalar must not contain ": " or " #" and must not start with a
// YAML indicator, or GitHub refuses the whole file. Multi-line `run: |` blocks are exempt.
test('YAML rule: a single-line `run:` value has no ": ", no " #" and does not start with a YAML indicator', () => {
  let checked = 0;
  for (const s of sources) {
    s.text.split('\n').forEach((line, i) => {
      const m = /^\s*(?:-\s+)?run:[ \t]+(\S.*)$/.exec(line);
      if (!m) return;
      const value = m[1].trimEnd();
      if (/^[|>][+-]?\d?(?:\s+#.*)?$/.test(value)) return; // block scalar
      if (/^["']/.test(value)) return; // quoted scalar: ": " is fine inside
      checked++;
      assert.doesNotMatch(value, /: /, `${s.name}:${i + 1}: plain scalar contains ": " (use a \`run: |\` block): ${value}`);
      assert.doesNotMatch(value, / #/, `${s.name}:${i + 1}: plain scalar contains " #" (a comment starts there): ${value}`);
      assert.doesNotMatch(value, /^[-?:,[\]{}#&*!|>'"%@`]/, `${s.name}:${i + 1}: plain scalar starts with a YAML indicator: ${value}`);
    });
  }
  assert.ok(checked > 0, 'at least one single-line run: value is checked');
});
