// The rules every workflow, the composite action and dependabot.yml follow (keepia/mail#17),
// checked on the parsed YAML by scripts/workflow-rules.mjs: actions pinned by commit SHA with the
// version in a comment (the same SHA wherever an action is used), exact permissions and
// triggers, required jobs that cannot be skipped, no `${{ }}` in `run`, npm only in its allowed
// forms, IBM's telemetry off where npm runs, one Node version (`.node-version`), checkouts
// without persisted credentials. The composite action in .github/actions/setup holds the Node
// and npm prelude and its pin. This file reads no YAML as text.
//
// Three corpora: the real files (no findings), the fixtures in scripts/fixtures/workflows (each
// gives exactly the findings in its `# want:` line) and the mutation table below (each row turns
// the real files red with exactly the findings it names).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY, RULES, SETUP_ACTION, SETUP_USES, checkFile, checkTree, classify, commandWords, parseYaml, toJS } from './workflow-rules.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_VERSION = readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim();
const FIXTURES = path.join(ROOT, 'scripts/fixtures/workflows');

const walk = (dir) => readdirSync(path.join(ROOT, dir)).sort()
  .flatMap((n) => (statSync(path.join(ROOT, dir, n)).isDirectory() ? walk(`${dir}/${n}`) : [`${dir}/${n}`]));
const TREE = walk('.github').map((p) => ({ path: p, src: readFileSync(path.join(ROOT, p), 'utf8') }));
const real = checkTree(TREE);
const fmt = (findings) => findings.map((f) => `${f.file}:${f.line}: ${f.rule}: ${f.message}`).join('\n');
const findingsOf = (...rules) => real.findings.filter((f) => rules.includes(f.rule));
const assertNone = (...rules) => assert.deepEqual(findingsOf(...rules), [], fmt(findingsOf(...rules)));
const parsed = (file) => {
  const { doc, findings } = parseYaml(file, TREE.find((f) => f.path === file).src);
  assert.ok(doc, fmt(findings));
  return toJS(doc.contents);
};
const workflows = TREE.filter((f) => classify(f.path)?.kind === 'workflow');
const actions = TREE.filter((f) => classify(f.path)?.kind === 'action');

test('the workflows are ci and secrets, the local action is setup', () => {
  assert.deepEqual(workflows.map((w) => path.basename(w.path)), ['ci.yml', 'secrets.yml']);
  assert.deepEqual(actions.map((a) => a.path), [SETUP_ACTION]);
});

test('the real files give no findings', () => {
  assert.deepEqual(real.findings, [], fmt(real.findings));
});

test('every YAML file under .github parses within the subset and is covered by a rule', () => {
  assertNone('parse', 'subset', 'scope', 'top-keys');
  assert.deepEqual(Object.keys(POLICY.workflows).sort(), workflows.map((w) => path.basename(w.path)), 'the policy covers exactly the workflows present');
  for (const f of TREE.filter((x) => /\.ya?ml$/.test(x.path))) assert.ok(classify(f.path), `${f.path} is covered`);
  for (const [name, p] of Object.entries(POLICY.workflows)) {
    for (const k of ['topKeys', 'permissions', 'on', 'scripts', 'jobs']) assert.ok(p[k] !== undefined, `${name}: the policy sets ${k}`);
  }
});

// The required checks of the ruleset are job names; a workflow with a required job has no
// trigger filter, so the check runs on every pull request (keepia/mail .claude/rules/ci.md).
test('the required checks check and secret-scan run on every pull request and every push to main', () => {
  assertNone('on', 'required', 'shell');
  for (const [file, job] of [['ci.yml', 'check'], ['secrets.yml', 'secret-scan']]) {
    assert.equal(POLICY.workflows[file].jobs[job].required, true, `${file}: ${job} is a required job in the policy`);
    assert.deepEqual(Object.keys(parsed(`.github/workflows/${file}`).jobs), [job]);
  }
});

test('every action is pinned by commit SHA with its version in a comment', () => {
  assertNone('pin', 'flow-uses', 'local-action');
  assert.ok(real.pins.length > 0, 'pinned uses found');
});

// Every occurrence of an action carries the same SHA and the same version comment, so a bump
// cannot be done halfway. actions/checkout and actions/setup-go are repeated per job; the
// shared Node prelude is the one thing that exists once.
test('all occurrences of an action use the same SHA and the same version comment', () => {
  assertNone('pin');
  const byAction = Map.groupBy(real.pins, (p) => p.action);
  assert.ok([...byAction.values()].some((list) => list.length > 1), 'at least one action is used more than once (the rule is exercised)');
});

test('the Node prelude is pinned in the setup action only', () => {
  assertNone('setup');
  const setup = parsed(SETUP_ACTION);
  assert.equal(setup.runs.using, 'composite');
  assert.equal(setup.runs.steps.filter((s) => /^actions\/setup-node@/.test(s.uses ?? '')).length, 1);
});

test('every job that runs npm checks out first and then uses the setup action', () => {
  assertNone('setup');
  const jobs = workflows.flatMap((w) => Object.values(parsed(w.path).jobs));
  const npmJobs = jobs.filter((j) => j.steps.some((s) => commandWords(s.run ?? '').length > 0));
  assert.ok(npmJobs.length > 0, 'at least one job runs npm');
  for (const j of npmJobs) assert.ok(j.steps.some((s) => s.uses === SETUP_USES));
});

test('npm installs without install scripts, with IBM telemetry off, once, in the setup action', () => {
  assertNone('npm', 'setup');
  assert.deepEqual(real.installs.map((i) => i.file), [SETUP_ACTION]);
});

// ---- one place for the Node version
test('.node-version holds one Node major', () => {
  assert.match(NODE_VERSION, /^\d+$/);
});

test('the setup-node step reads .node-version and nothing names a Node version', () => {
  assertNone('node-version');
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

test('dependabot.yml: npm, github-actions and gomod, weekly, with a 14-day cooldown, covering the composite actions', () => {
  assertNone('dependabot');
  assert.ok(existsSync(path.join(ROOT, 'package.json')) && existsSync(path.join(ROOT, 'package-lock.json')), 'npm: manifest and lockfile at /');
  assert.ok(existsSync(path.join(ROOT, '.github/workflows')), 'github-actions: / has .github/workflows');
  assert.ok(actions.length > 0, 'github-actions: the glob matches at least one composite action');
  assert.ok(existsSync(path.join(ROOT, 'tools/gitleaks/go.mod')), 'gomod: /tools/gitleaks holds go.mod');
  assert.ok(!existsSync(path.join(ROOT, 'go.mod')), 'no root go.mod: this is a Node repository');
  const goFiles = parsed('.github/workflows/secrets.yml').jobs['secret-scan'].steps.map((s) => s.with?.['go-version-file']).filter(Boolean);
  assert.deepEqual(goFiles, ['tools/gitleaks/go.mod'], 'the setup-go step reads the go.mod Dependabot updates');
});

test('every checkout leaves no credentials behind', () => {
  assertNone('persist-credentials');
  assert.ok(real.pins.some((p) => p.action === 'actions/checkout'), 'at least one checkout is checked');
});

test('every workflow grants only contents: read, at the top level, and no job asks for more', () => {
  assertNone('permissions');
  for (const w of workflows) assert.deepEqual(parsed(w.path).permissions, { contents: 'read' });
});

// ---- one entry point for the generation order
// The sh blocks of README "Building", as command lines without comments (a whole-line comment
// counts as no command).
const readmeBlocks = () => [...building().matchAll(/```sh\n([\s\S]*?)```/g)]
  .map((m) => m[1].split('\n').map((l) => l.replace(/(?:^|\s+)#.*$/, '').trim()).filter(Boolean));

test('CI and README "Building" call the same entry point and the same install line', () => {
  assertNone('build-entry');
  const { step, commands } = POLICY.workflows['ci.yml'].buildEntry;
  const run = parsed('.github/workflows/ci.yml').jobs.check.steps.find((s) => s.name === step).run;
  assert.deepEqual(run.split('\n').map((l) => l.trim()).filter((l) => /^npm run /.test(l)), commands);
  const [setup] = readmeBlocks();
  assert.ok(setup?.length, 'README "Building" setup block');
  assert.ok(setup.includes('npm ci --ignore-scripts'), 'README installs as the setup action does');
  assert.ok(setup.includes(commands[0]), 'README "Building" runs npm run build:all');
  assert.ok(setup.indexOf('npm ci --ignore-scripts') < setup.indexOf(commands[0]), 'install before build');
});

test('CI does not call a script directly other than check-pack, only the entry point defines the order', () => {
  assertNone('scripts');
});

test('README "Building" lists the steps of scripts/build_all.mjs in its order', async () => {
  const { STEPS, commandOf } = await import('./build_all.mjs');
  const blocks = readmeBlocks();
  assert.equal(blocks.length, 2, 'README "Building": a setup block and a step block');
  assert.deepEqual(blocks[1], STEPS.map(commandOf), 'README step list and STEPS differ in commands or order');
});

test('a run value is a string without ${{ }}, a plain one without a trailing comment, run by bash', () => {
  assertNone('run', 'run-expression', 'shell');
});

// ---- fixtures

const fixtureNames = readdirSync(FIXTURES).filter((n) => n.endsWith('.yml')).sort();
const FIXTURE_COUNT = 66;
const wantOf = (src, name) => {
  const m = /^# want: (.*?)\r?$/m.exec(src);
  assert.ok(m, `${name}: a "# want:" line`);
  return m[1].trim() === 'none' ? [] : m[1].trim().split(/\s+/);
};
const sorted = (list) => [...list].sort();
// The fixtures are checked with the rules every file follows; the per-workflow policy
// (permissions, triggers, required jobs) is covered by the mutation table.
const fixtureCtx = () => ({ kind: 'workflow', policy: { scripts: ['check-pack.mjs'] }, actions: new Set([SETUP_USES]) });

test('the fixtures: every pass-* gives no finding, every fail-* exactly its # want list', () => {
  assert.equal(fixtureNames.length, FIXTURE_COUNT, 'fixture count (update FIXTURE_COUNT with a new fixture)');
  const wrong = [];
  for (const name of fixtureNames) {
    const src = readFileSync(path.join(FIXTURES, name), 'utf8');
    const want = wantOf(src, name);
    assert.ok(/^(pass|fail)-/.test(name), `${name}: pass-* or fail-*`);
    assert.equal(want.length === 0, name.startsWith('pass-'), `${name}: a pass fixture wants none, a fail fixture something`);
    const got = checkFile(name, src, fixtureCtx());
    const lines = sorted(got.map((f) => `${f.line}:${f.rule}`));
    if (JSON.stringify(lines) !== JSON.stringify(sorted(want))) wrong.push(`${name}: want ${sorted(want).join(' ') || 'none'}, got:\n${fmt(got)}`);
  }
  assert.deepEqual(wrong, []);
});

// ---- mutations of the real files

const CO = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
const CI = '.github/workflows/ci.yml';
const SECRETS = '.github/workflows/secrets.yml';
const DEPENDABOT = '.github/dependabot.yml';
const ISSUES = '.github/ISSUE_TEMPLATE/config.yml';
// [source, what, edits, expected `file:line:rule` list]. An edit is [file, find, replace] (the
// first occurrence; `find` must occur, so a row that no longer applies fails loudly) or
// [file, null, src] (a new file).
const MUTATIONS = [
  ['A CP-A', 'job if on secret-scan', [[SECRETS, '    name: secret-scan\n', "    name: secret-scan\n    if: github.actor != 'dependabot[bot]'\n"]], [`${SECRETS}:26:required`]],
  ['A CP-C', 'event title in the Tests run', [[CI, '        run: npm test\n', '        run: |\n          echo "${{ github.event.pull_request.title }}"\n          npm test\n']], [`${CI}:52:run-expression`]],
  ['B 1', 'flow-style unpinned step', [[CI, '      - uses: ./.github/actions/setup\n', '      - { uses: tj-actions/changed-files@v45 }\n      - uses: ./.github/actions/setup\n']], [`${CI}:39:flow-uses`]],
  ['B 2', 'quoted "permissions": write-all on check', [[CI, '    name: check\n', '    name: check\n    "permissions": write-all\n']], [`${CI}:30:permissions`, `${CI}:30:required`]],
  ['B 3', 'comment line, then persist-credentials: true', [[CI, '        with:\n          persist-credentials: false\n', '        # persist-credentials: false\n        with:\n          persist-credentials: true\n']], [`${CI}:38:persist-credentials`]],
  ['B 4', 'quoted "if": false on secret-scan', [[SECRETS, '    name: secret-scan\n', '    name: secret-scan\n    "if": false\n']], [`${SECRETS}:26:required`]],
  ['B 5', 'pull_request:, blank line, quoted paths-ignore', [[SECRETS, '  pull_request:\n', '  pull_request:\n\n    "paths-ignore": ["**"]\n']], [`${SECRETS}:7:on`]],
  ['B 6', 'npm clean-install', [[CI, '      - name: Tests\n', '      - run: npm clean-install\n\n      - name: Tests\n']], [`${CI}:51:npm`]],
  ['B 7', 'flow-style checkout@v4 with persist-credentials: true', [[SECRETS, `      - uses: ${CO}\n        with:\n          persist-credentials: false\n          fetch-depth: 0\n`, '      - { uses: actions/checkout@v4, with: { persist-credentials: true } }\n']], [`${SECRETS}:29:flow-uses`, `${SECRETS}:29:persist-credentials`]],
  ['B 8', 'paths-ignore under pull_request', [[SECRETS, '  pull_request:\n', '  pull_request:\n    paths-ignore: ["**"]\n']], [`${SECRETS}:7:on`]],
  ['new', 'step if: false on Tests', [[CI, '      - name: Tests\n', '      - name: Tests\n        if: false\n']], [`${CI}:52:required`]],
  ['new', 'step continue-on-error: true on Tests', [[CI, '      - name: Tests\n', '      - name: Tests\n        continue-on-error: true\n']], [`${CI}:52:required`]],
  ['new', 'Actions/Checkout without with', [[CI, `      - uses: ${CO}\n        with:\n          persist-credentials: false\n`, `      - uses: ${CO.replace('actions/checkout', 'Actions/Checkout')}\n`]], [`${CI}:35:persist-credentials`]],
  ['new', 'alias key *k with an anchored uses', [[CI, 'name: CI\n', 'name: &k uses\n'], [CI, '      - uses: ./.github/actions/setup\n', '      - *k : tj-actions/changed-files@v45\n      - uses: ./.github/actions/setup\n']], [`${CI}:1:subset`, `${CI}:39:subset`, `${CI}:39:required`]],
  ['new', 'explicit key ? uses', [[CI, '      - uses: ./.github/actions/setup\n', '      - ? uses\n        : tj-actions/changed-files@v45\n      - uses: ./.github/actions/setup\n']], [`${CI}:39:subset`, `${CI}:39:pin`]],
  ['new', 'escaped key without a version comment', [[CI, '      - uses: ./.github/actions/setup\n', '      - "u\\x73es": tj-actions/changed-files@0000000000000000000000000000000000000000\n      - uses: ./.github/actions/setup\n']], [`${CI}:39:pin`]],
  ['new', 'npm option before the subcommand', [[CI, '        run: npm test\n', '        run: npm --prefix . ci\n']], [`${CI}:52:npm`]],
  ['new', 'npx', [[CI, '        run: npm test\n', '        run: npx foo\n']], [`${CI}:52:npm`]],
  ['new', 'plain run with a trailing comment', [[CI, '        run: npm test\n', '        run: npm test #x\n']], [`${CI}:52:run`]],
  ['new', 'a second document', [[CI, 'name: CI\n', 'name: CI\n---\nname: CI\n']], [`${CI}:2:parse`]],
  ['new', 'pull_request_target', [[SECRETS, '  pull_request:\n', '  pull_request_target:\n']], [`${SECRETS}:7:on`]],
  ['new', 'steps output in a secrets.yml run', [[SECRETS, '          make secrets\n', '          echo ${{ steps.x.outputs.y }}\n          make secrets\n']], [`${SECRETS}:47:run-expression`]],
  ['new', 'escaped ${{ in a quoted run', [[CI, '        run: npm test\n', '        run: "echo \\x24{{ github.head_ref }} && npm test"\n']], [`${CI}:52:run-expression`]],
  ['new', 'setup action: npm i', [[SETUP_ACTION, '      run: npm ci --ignore-scripts\n', '      run: npm i\n']], [`${SETUP_ACTION}:19:npm`, `${SETUP_ACTION}:1:npm`]],
  ['new', 'setup action: event data in its run', [[SETUP_ACTION, '      run: npm ci --ignore-scripts\n', '      run: |\n        echo "${{ github.event.issue.title }}"\n        npm ci --ignore-scripts\n']], [`${SETUP_ACTION}:19:run-expression`]],
  ['new', 'setup action: npm ci twice', [[SETUP_ACTION, '      run: npm ci --ignore-scripts\n', '      run: |\n        npm ci --ignore-scripts\n        npm ci --ignore-scripts\n']], [`${SETUP_ACTION}:1:npm`]],
  ['new', 'uses: ./.github/actions/other', [[CI, '      - uses: ./.github/actions/setup\n', '      - uses: ./.github/actions/other\n']], [`${CI}:39:local-action`, `${CI}:28:setup`]],
  ['new', 'job permissions contents: write on check', [[CI, '    name: check\n', '    name: check\n    permissions:\n      contents: write\n']], [`${CI}:30:permissions`, `${CI}:30:required`]],
  ['new', 'top-level read-all', [[SECRETS, 'permissions:\n  contents: read\n', 'permissions: read-all\n']], [`${SECRETS}:12:permissions`]],
  ['new', 'a nested composite action', [['.github/actions/x/y/action.yml', null, 'name: x\nruns:\n  using: composite\n  steps: []\n']], ['.github/actions/x/y/action.yml:1:scope']],
  ['new', 'action.yaml next to action.yml', [['.github/actions/setup/action.yaml', null, 'name: x\n']], ['.github/actions/setup/action.yaml:1:scope']],
  ['new', 'a workflow without a policy', [['.github/workflows/new.yml', null, 'name: new\non: push\njobs: {}\n']], ['.github/workflows/new.yml:1:scope']],
  ['N2', 'defaults.run.shell "true {0}"', [[CI, '    shell: bash\n', '    shell: "true {0}"\n']], [`${CI}:21:shell`]],
  ['N2', 'defaults.run.working-directory', [[CI, '    shell: bash\n', '    shell: bash\n    working-directory: docs\n']], [`${CI}:19:shell`]],
  ['N2', 'top-level env', [[CI, 'defaults:\n', 'env:\n  BASH_ENV: ./x\n\ndefaults:\n']], [`${CI}:19:top-keys`]],
  ['N2', 'NODE_OPTIONS in the env of check', [[CI, "      IBM_TELEMETRY_DISABLED: 'true'\n", "      IBM_TELEMETRY_DISABLED: 'true'\n      NODE_OPTIONS: --require ./x.js\n"]], [`${CI}:32:required`]],
  ['N2', 'job-level defaults on secret-scan', [[SECRETS, '    timeout-minutes: 15\n', '    timeout-minutes: 15\n    defaults:\n      run:\n        shell: bash\n']], [`${SECRETS}:28:required`]],
  ['N3', '%YAML 1.1 directive with persist-credentials: no', [[SECRETS, 'name: Secrets\n', '%YAML 1.1\n---\nname: Secrets\n'], [SECRETS, '          persist-credentials: false\n', '          persist-credentials: no\n']], [`${SECRETS}:1:subset`, `${SECRETS}:9:subset`, `${SECRETS}:9:top-keys`, `${SECRETS}:3:on`]],
  ['new', 'a second job next to check', [[CI, '        run: npm pack --dry-run --json --ignore-scripts | node scripts/check-pack.mjs\n', '        run: npm pack --dry-run --json --ignore-scripts | node scripts/check-pack.mjs\n\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n']], [`${CI}:28:required`, `${CI}:57:permissions`]],
  ['new', 'check renamed', [[CI, '    name: check\n', '    name: Check\n']], [`${CI}:29:required`]],
  ['new', 'build entry changed', [[CI, '          npm run build:all\n', '          npm run build\n']], [`${CI}:42:build-entry`]],
  ['new', 'drift check removed', [[CI, '            echo "::error::npm run build:all changed the tree; run it (README, Building) and commit the result"\n', '']], [`${CI}:42:build-entry`]],
  ['new', 'a script called directly', [[CI, '        run: npm test\n', '        run: node scripts/build.mjs && npm test\n']], [`${CI}:52:scripts`]],
  ['new', 'a different checkout SHA in one file', [[SECRETS, CO, CO.replace('3d3c42e5', '0000000a')]], [`${SECRETS}:29:pin`]],
  ['new', 'setup-node in ci.yml', [[CI, '      - uses: ./.github/actions/setup\n', '      - uses: ./.github/actions/setup\n      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0\n        with:\n          node-version-file: .node-version\n']], [`${CI}:40:setup`]],
  ['new', 'node-version in the setup action', [[SETUP_ACTION, '        node-version-file: .node-version\n', '        node-version: 26\n']], [`${SETUP_ACTION}:10:node-version`, `${SETUP_ACTION}:12:node-version`, `${SETUP_ACTION}:12:setup`]],
  ['new', 'setup-node cache on', [[SETUP_ACTION, '        package-manager-cache: false\n', '        package-manager-cache: true\n']], [`${SETUP_ACTION}:10:setup`]],
  ['new', 'telemetry off removed from the setup action', [[SETUP_ACTION, "      env:\n        IBM_TELEMETRY_DISABLED: 'true'\n", '']], [`${SETUP_ACTION}:17:setup`]],
  ['new', 'telemetry off removed from check', [[CI, "    env:\n      IBM_TELEMETRY_DISABLED: 'true'\n", '']], [`${CI}:28:setup`, `${CI}:28:required`]],
  ['new', 'the setup action checks out', [[SETUP_ACTION, '  steps:\n', `  steps:\n    - uses: ${CO}\n      with:\n        persist-credentials: false\n`]], [`${SETUP_ACTION}:10:setup`]],
  ['new', 'an input on the setup action', [[SETUP_ACTION, 'runs:\n', 'inputs:\n  x:\n    description: x\nruns:\n']], [`${SETUP_ACTION}:7:top-keys`]],
  ['new', 'step if in the setup action', [[SETUP_ACTION, '      shell: bash\n', '      shell: bash\n      if: false\n']], [`${SETUP_ACTION}:17:required`]],
  ['new', 'shell sh in the setup action', [[SETUP_ACTION, '      shell: bash\n', '      shell: sh\n']], [`${SETUP_ACTION}:16:shell`]],
  ['new', 'Dependabot cooldown 7 days', [[DEPENDABOT, '      default-days: 14\n', '      default-days: 7\n']], [`${DEPENDABOT}:15:dependabot`]],
  ['new', 'Dependabot without gomod', [[DEPENDABOT, '  - package-ecosystem: gomod\n    directory: /tools/gitleaks\n', '  - package-ecosystem: pip\n    directory: /\n']], [`${DEPENDABOT}:32:dependabot`]],
  ['new', 'an anchor in the issue template config', [[ISSUES, 'blank_issues_enabled: true\n', 'blank_issues_enabled: &t true\n']], [`${ISSUES}:1:subset`]],
];

const mutate = (edits) => {
  const tree = TREE.map((f) => ({ ...f }));
  for (const [file, find, replace] of edits) {
    if (find === null) { tree.push({ path: file, src: replace }); continue; }
    const f = tree.find((x) => x.path === file);
    const src = f.src.replace(find, replace);
    assert.notEqual(src, f.src, `${file}: ${JSON.stringify(find)} no longer occurs`);
    f.src = src;
  }
  return tree;
};

test('the mutation table: every row turns the real files red with exactly its findings', () => {
  const wrong = [];
  for (const [source, what, edits, want] of MUTATIONS) {
    const got = checkTree(mutate(edits)).findings;
    const lines = sorted(got.map((f) => `${f.file}:${f.line}:${f.rule}`));
    if (JSON.stringify(lines) !== JSON.stringify(sorted(want))) wrong.push(`${source}, ${what}: want ${sorted(want).join(' ')}, got:\n${fmt(got)}`);
  }
  assert.deepEqual(wrong, []);
});

test('every rule has a red case: a fail fixture or a mutation row', () => {
  const red = new Set([
    ...fixtureNames.flatMap((n) => wantOf(readFileSync(path.join(FIXTURES, n), 'utf8'), n).map((w) => w.split(':')[1])),
    ...MUTATIONS.flatMap((row) => row[3].map((w) => w.split(':').at(-1))),
  ]);
  for (const rule of RULES) assert.ok(red.has(rule), `rule ${rule} has no fail fixture and no mutation row`);
  for (const rule of red) assert.ok(RULES.includes(rule), `${rule} is not in RULES`);
});
