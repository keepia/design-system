// The rules every workflow, the composite actions and dependabot.yml follow (keepia/mail#17),
// checked on the parsed YAML, never on the text. `yaml` keeps comments and source positions on
// its nodes, so the `# vX.Y.Z` comment of a pin is read from the value node it belongs to.
// Fail closed: a file outside the YAML subset below is a finding, never interpreted.
// docs/development/index.md ("Workflows and action pinning") describes the rules and their limits.

import { CST, Parser, isAlias, isMap, isScalar, isSeq, parseAllDocuments } from 'yaml';

// Every rule id a finding can carry. scripts/workflows.test.mjs checks that each one has a red
// case (a fail fixture or a mutation row).
export const RULES = [
  'parse', 'subset', 'scope', 'top-keys',
  'pin', 'flow-uses', 'local-action',
  'permissions', 'persist-credentials', 'on', 'required',
  'run-expression', 'run', 'shell', 'npm',
  'setup', 'node-version', 'build-entry', 'scripts', 'dependabot',
];

export const SETUP_ACTION = '.github/actions/setup/action.yml';
export const SETUP_USES = './.github/actions/setup';
const TELEMETRY = { IBM_TELEMETRY_DISABLED: 'true' };
const WORKFLOW_KEYS = ['name', 'on', 'permissions', 'concurrency', 'defaults', 'jobs'];
// The keys a required job and every step of it (and of a composite action) may have: no `if`,
// `continue-on-error`, `needs`, `strategy`, `defaults` or `uses`, so nothing turns the check
// green without running it.
const REQUIRED_JOB_KEYS = ['name', 'runs-on', 'timeout-minutes', 'env', 'steps'];
const REQUIRED_STEP_KEYS = ['name', 'id', 'uses', 'with', 'run', 'env', 'shell'];
const REQUIRED_ON = { push: { branches: ['main'] }, pull_request: null };

// One entry per workflow in .github/workflows; a workflow without an entry fails (scope).
// `jobs` lists every job: `permissions` absent means the job has no `permissions` key;
// `required` jobs are the required checks of the ruleset; `env` is a required job's exact env;
// `stepEnv` names, per step name, the env variables a step of a required job may set (a step
// not listed sets none), so BASH_ENV, npm_config_* or MAKEFLAGS cannot turn it green.
// `scripts` are the files under scripts/ a `run` may call with node (per job, else per file).
export const POLICY = {
  workflows: {
    'ci.yml': {
      topKeys: WORKFLOW_KEYS,
      permissions: { contents: 'read' },
      on: REQUIRED_ON,
      scripts: ['check-pack.mjs'],
      jobs: { check: { required: true, env: TELEMETRY, stepEnv: {} } },
      buildEntry: { job: 'check', step: 'Generated files are committed', commands: ['npm run build:all'] },
    },
    'secrets.yml': {
      topKeys: WORKFLOW_KEYS,
      permissions: { contents: 'read' },
      on: REQUIRED_ON,
      scripts: [],
      jobs: {
        'secret-scan': {
          required: true,
          stepEnv: { 'Scan the new commits': ['EVENT', 'BASE_SHA', 'HEAD_SHA', 'BEFORE_SHA', 'AFTER_SHA'] },
        },
      },
    },
  },
  actionKeys: ['name', 'description', 'runs'],
  // The scripts `npm run <name>` may run, with no further argument.
  npmRun: ['build:all'],
  // The exact `npm pack` commands (the words after `npm`).
  npmPack: ['pack --dry-run --json --ignore-scripts'],
  // The inputs an actions/checkout in a required job may set, so it checks out the PR's code.
  requiredCheckoutInputs: ['persist-credentials', 'fetch-depth'],
  // The env names, per step name, a step of a composite action may set.
  actionStepEnv: { 'Install dependencies without install scripts': Object.keys(TELEMETRY) },
  dependabot: {
    version: 2,
    updates: [
      {
        'package-ecosystem': 'npm', directory: '/', schedule: { interval: 'weekly' },
        cooldown: { 'default-days': 14 }, groups: { 'npm-dependencies': { 'update-types': ['minor', 'patch'] } },
      },
      {
        'package-ecosystem': 'github-actions', directories: ['/', '/.github/actions/*'],
        schedule: { interval: 'weekly' }, cooldown: { 'default-days': 14 },
      },
      {
        'package-ecosystem': 'gomod', directory: '/tools/gitleaks', schedule: { interval: 'weekly' },
        cooldown: { 'default-days': 14 },
      },
    ],
  },
};

// ---- parsing

const lineOf = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
};

// Parses `src` and checks the YAML subset. Returns { doc, line, findings }; `doc` is null when
// the tree is not usable (any parser error or warning, not exactly one document, a root that is
// not a mapping), and then the findings say why.
export function parseYaml(file, src) {
  const line = lineOf(src);
  const findings = [];
  const add = (offset, rule, message) => findings.push({ file, line: line(offset ?? 0), rule, message });
  const docs = parseAllDocuments(src, { keepSourceTokens: true });
  for (const d of docs) {
    for (const e of [...d.errors, ...d.warnings]) add(e.pos?.[0], 'parse', `${e.code}: ${e.message.split('\n')[0]}`);
  }
  if (docs.length !== 1) add(docs[1]?.range?.[0] ?? 0, 'parse', `${docs.length} YAML documents; exactly one is allowed`);
  const doc = docs[0];
  if (doc && !isMap(doc.contents)) add(doc.contents?.range?.[0] ?? 0, 'parse', 'the root is not a mapping');
  // Subset, on the token stream: directives (%YAML changes the schema, %TAG the tags) and
  // explicit `?` keys.
  for (const token of new Parser().parse(src)) {
    if (token.type === 'directive') add(token.offset, 'subset', `directive ${token.source.trim()} is not allowed`);
    if (token.type !== 'document') continue;
    CST.visit(token, (item) => {
      for (const t of [...item.start, ...(item.sep ?? [])]) {
        if (t.type === 'explicit-key-ind') add(t.offset, 'subset', 'explicit key (`?`) is not allowed');
      }
    });
  }
  // Subset, on the nodes: aliases, anchors (and so merge keys), explicit tags, keys that are not
  // strings.
  const walk = (node) => {
    if (node == null) return;
    if (isAlias(node)) { add(node.range?.[0], 'subset', `alias *${node.source} is not allowed`); return; }
    // The node's range starts after its properties; report the line of the `&` or `!`.
    if (node.anchor) add(src.lastIndexOf(`&${node.anchor}`, node.range?.[0]), 'subset', `anchor &${node.anchor} is not allowed`);
    if (node.tag) add(src.lastIndexOf('!', node.range?.[0]), 'subset', `tag ${node.tag} is not allowed`);
    if (isMap(node)) {
      for (const pair of node.items) {
        const k = pair.key;
        if (!isAlias(k) && !(isScalar(k) && typeof k.value === 'string')) {
          add(k?.range?.[0] ?? pair.value?.range?.[0], 'subset', 'a mapping key that is not a string');
        }
        walk(k);
        walk(pair.value);
      }
    } else if (isSeq(node)) {
      for (const item of node.items) walk(item);
    }
  };
  for (const d of docs) walk(d.contents);
  const usable = docs.length === 1 && findings.every((f) => f.rule !== 'parse');
  return { doc: usable ? doc : null, line, findings };
}

// ---- node helpers

const keyOf = (pair) => (isScalar(pair.key) && typeof pair.key.value === 'string' ? pair.key.value : undefined);
const pairOf = (map, name) => (isMap(map) ? map.items.find((p) => keyOf(p) === name) : undefined);
const valueOf = (map, name) => pairOf(map, name)?.value;
// Action inputs (`with`) are case-insensitive on GitHub.
const inputOf = (map, name) => (isMap(map) ? map.items.find((p) => keyOf(p)?.toLowerCase() === name) : undefined);
const str = (node) => (isScalar(node) && typeof node.value === 'string' ? node.value : undefined);
const keysOf = (map) => (isMap(map) ? map.items.map(keyOf) : []);

// The plain JavaScript value of a node (the subset has no aliases).
export function toJS(node) {
  if (node == null) return null;
  if (isScalar(node)) return node.value;
  if (isSeq(node)) return node.items.map(toJS);
  if (isMap(node)) return Object.fromEntries(node.items.map((p) => [keyOf(p), toJS(p.value)]));
  return undefined;
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const equal = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// Every pair in the tree with its ancestors (maps and sequences, outermost first).
function pairs(root) {
  const out = [];
  const walk = (node, ancestors) => {
    if (isMap(node)) {
      for (const p of node.items) {
        out.push({ pair: p, map: node, ancestors });
        walk(p.value, [...ancestors, node]);
      }
    } else if (isSeq(node)) {
      for (const item of node.items) walk(item, [...ancestors, node]);
    }
  };
  walk(root, []);
  return out;
}

// ---- run values: command words

// A command word ends at the first character that cannot be part of a name, so `npm>x`,
// `npm<x` and `npm\` + newline count too.
const CMD = /(?:^|[\s;&|(){}!`$"'\/\\])(npm|npx|pnpm|yarn|corepack)(?![\w.-])/g;
// The npm commands a `run` may contain. `ci --ignore-scripts` exactly is allowed in the setup
// action only (and there once; checkTree counts it).
function npmProblem(word, rest, file) {
  if (word !== 'npm') return `${word} is not used here`;
  const cmd = rest.replace(/^["'`]/, '').replace(/^[ \t]+/, '');
  const segment = cmd.split(/[;&|)`\n]/)[0].trim();
  // Exact forms only: any further option (`--script-shell=…`, `--prefix=…`,
  // `--ignore-scripts=false`) could turn the step green without running it.
  if (segment === 'test') return null;
  if (POLICY.npmRun.some((name) => segment === `run ${name}`)) return null;
  if (POLICY.npmPack.includes(segment)) return null;
  if (segment === 'ci --ignore-scripts' && file === SETUP_ACTION) return null;
  return `npm ${segment || '(nothing)'} is not an allowed npm command`;
}
export function commandWords(run) {
  return [...run.matchAll(CMD)].map((m) => ({ word: m[1], rest: run.slice(m.index + m[0].length) }));
}
// `node` as a command word, then its arguments up to the end of the command; any argument
// under scripts/ counts, also after options (`node --import x scripts/…`) and in quotes.
const NODE = /(?:^|[\s;&|(){}!`$"'\/\\])node(?![\w.-])([^;&|\n]*)/g;
const SCRIPT_ARG = /(?:^|[\s"'=])(?:\.\/)?scripts\/([^\s;&|)`"']+)/g;

// ---- checks

// Checks one file. `ctx`: { kind: 'workflow' | 'action' | 'dependabot' | 'subset', policy,
// actions (Set of scanned local actions, './.github/actions/<dir>'), pins (optional: an array
// that collects the pins for the cross-file check of checkTree) }. Returns
// [{ file, line, rule, message }].
export function checkFile(file, src, ctx) {
  const { doc, line, findings } = parseYaml(file, src);
  if (!doc || ctx.kind === 'subset') return findings;
  const add = (node, rule, message) => findings.push({ file, line: line(node?.range?.[0] ?? 0), rule, message });
  const root = doc.contents;
  if (ctx.kind === 'dependabot') {
    checkDependabot(root, add);
    return findings;
  }
  const policy = ctx.policy ?? {};
  const all = pairs(root);

  for (const { pair, map, ancestors } of all) {
    const key = keyOf(pair);
    const value = pair.value;
    if (key === 'uses') checkUses(pair, [...ancestors, map], src, file, ctx, add, line);
    if (key === 'with' && isMap(value)) {
      const seen = new Set();
      for (const p of value.items) {
        const k = keyOf(p)?.toLowerCase();
        if (k !== undefined && seen.has(k)) add(p.key, 'subset', `input ${keyOf(p)} repeats another input that differs only in case`);
        seen.add(k);
      }
    }
    if (key === 'node-version') add(pair.key, 'node-version', 'node-version names a Node version; use node-version-file: .node-version in the setup action');
    if (key === 'shell' && str(value) !== 'bash') add(pair.key, 'shell', `shell ${JSON.stringify(toJS(value))}; only bash`);
    if (key === 'defaults') {
      const run = valueOf(value, 'run');
      if (!isMap(value) || !equal(keysOf(value), ['run']) || !isMap(run) || !equal(keysOf(run), ['shell'])) {
        add(pair.key, 'shell', 'defaults may only set run.shell');
      }
    }
    if (key === 'run') {
      const parent = ancestors.length ? ancestors.at(-1) : null;
      const underDefaults = isMap(parent) && parent.items.some((p) => p.value === map && keyOf(p) === 'defaults');
      if (underDefaults) continue;
      if (str(value) === undefined) { add(pair.key, 'run', 'run is not a string'); continue; }
      checkRun(pair, src, file, add);
    }
  }

  // Every checkout drops its credentials.
  for (const { pair, map } of all) {
    if (keyOf(pair) !== 'uses' || !/^actions\/checkout@/i.test(str(pair.value) ?? '')) continue;
    const pc = inputOf(valueOf(map, 'with'), 'persist-credentials');
    if (!(isScalar(pc?.value) && pc.value.value === false)) {
      add(pc?.key ?? pair.key, 'persist-credentials', 'actions/checkout without persist-credentials: false');
    }
  }

  if (ctx.kind === 'action') checkAction(file, root, add);
  if (ctx.kind === 'workflow') checkWorkflow(root, policy, add);
  return findings;
}

function checkUses(pair, ancestors, src, file, ctx, add, line) {
  if (ancestors.some((n) => n.flow)) { add(pair.key, 'flow-uses', 'write uses in block style'); return; }
  const v = pair.value;
  const value = str(v);
  const scalarTypes = ['PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE'];
  if (value === undefined || !scalarTypes.includes(v.type) || src.slice(v.range[0], v.range[1]).includes('\n')) {
    add(pair.key, 'pin', 'uses is not a single-line string');
    return;
  }
  if (value.startsWith('./')) {
    if (!ctx.actions?.has(value)) add(pair.key, 'local-action', `${value} is not a scanned composite action (.github/actions/<dir>/action.yml)`);
    return;
  }
  const m = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})$/.exec(value);
  if (!m) { add(pair.key, 'pin', `${value}: not owner/repo@<40-hex SHA>`); return; }
  if (!/^ v\d+\.\d+\.\d+$/.test(v.comment ?? '')) { add(pair.key, 'pin', `${value}: no "# vX.Y.Z" comment on the value`); return; }
  ctx.pins?.push({ file, line: line(pair.key.range[0]), action: m[1].toLowerCase(), sha: m[2], comment: v.comment });
}

function checkRun(pair, src, file, add) {
  const v = pair.value;
  const run = v.value;
  if (run.includes('${{')) add(pair.key, 'run-expression', '${{ }} in run; pass the value through env: and use "$VAR"');
  if (v.type === 'PLAIN' && /^[ \t]+#/.test(src.slice(v.range[1]).split('\n')[0])) {
    add(pair.key, 'run', 'a plain run value with a trailing comment (the comment is dropped); quote it or use run: |');
  }
  for (const { word, rest } of commandWords(run)) {
    const problem = npmProblem(word, rest, file);
    if (problem) add(pair.key, 'npm', problem);
  }
}

function checkScripts(pair, allowed, add) {
  for (const cmd of str(pair.value).matchAll(NODE)) {
    for (const m of cmd[1].matchAll(SCRIPT_ARG)) {
      if (!allowed.includes(m[1])) add(pair.key, 'scripts', `node scripts/${m[1]} is not in the policy`);
    }
  }
}

const stepsOf = (map, add, where) => {
  const steps = valueOf(map, 'steps');
  if (steps === undefined) return [];
  if (!isSeq(steps) || !steps.items.every(isMap)) { add(pairOf(map, 'steps').key, 'run', `${where}: steps is not a sequence of mappings`); return []; }
  return steps.items;
};
const runsNpm = (steps) => steps.some((s) => commandWords(str(valueOf(s, 'run')) ?? '').length > 0);
const usesOf = (step) => str(valueOf(step, 'uses')) ?? '';

// `stepEnv`: per step name, the env names the step may set.
function checkStepKeys(steps, stepEnv, add, where) {
  for (const step of steps) {
    for (const p of step.items) {
      if (!REQUIRED_STEP_KEYS.includes(keyOf(p))) add(p.key, 'required', `${where}: step key ${keyOf(p)} is not allowed`);
    }
    const env = pairOf(step, 'env');
    if (!env) continue;
    const allowed = stepEnv[str(valueOf(step, 'name'))] ?? [];
    if (!isMap(env.value)) { add(env.key, 'required', `${where}: step env is not a mapping`); continue; }
    for (const p of env.value.items) {
      if (!allowed.includes(keyOf(p))) add(p.key, 'required', `${where}: step env ${keyOf(p)} is not in the policy`);
    }
  }
}

function checkAction(file, root, add) {
  for (const p of root.items) {
    if (!POLICY.actionKeys.includes(keyOf(p))) add(p.key, 'top-keys', `${keyOf(p)} is not an allowed key of an action`);
  }
  const runs = valueOf(root, 'runs');
  if (!isMap(runs)) { add(root, 'top-keys', 'runs is not a mapping'); return; }
  for (const p of runs.items) if (!['using', 'steps'].includes(keyOf(p))) add(p.key, 'top-keys', `runs.${keyOf(p)} is not allowed`);
  if (str(valueOf(runs, 'using')) !== 'composite') add(pairOf(runs, 'using')?.key ?? runs, 'setup', 'the action is not using: composite');
  const steps = stepsOf(runs, add, file);
  checkStepKeys(steps, POLICY.actionStepEnv, add, file);
  for (const step of steps) {
    const run = pairOf(step, 'run');
    if (run && str(run.value) !== undefined) checkScripts(run, [], add);
  }
  if (file !== SETUP_ACTION) {
    for (const step of steps) if (/^actions\/setup-node@/i.test(usesOf(step))) add(pairOf(step, 'uses').key, 'setup', 'actions/setup-node outside the setup action');
    return;
  }
  const node = steps.filter((s) => /^actions\/setup-node@/i.test(usesOf(s)));
  if (node.length !== 1) add(runs, 'setup', `${node.length} actions/setup-node steps; exactly one`);
  for (const s of node) {
    const w = valueOf(s, 'with');
    if (str(valueOf(w, 'node-version-file')) !== '.node-version') add(pairOf(s, 'uses').key, 'node-version', 'setup-node without node-version-file: .node-version');
    const cache = valueOf(w, 'package-manager-cache');
    if (!(isScalar(cache) && cache.value === false)) add(pairOf(s, 'uses').key, 'setup', 'setup-node without package-manager-cache: false');
    for (const k of keysOf(w)) if (!['node-version-file', 'package-manager-cache'].includes(k)) add(pairOf(w, k).key, 'setup', `setup-node input ${k} is not allowed`);
  }
  for (const s of steps) {
    if (/^actions\/checkout@/i.test(usesOf(s))) add(pairOf(s, 'uses').key, 'setup', 'the setup action does not check out; the caller does, before it');
    if (runsNpm([s]) && !equal(toJS(valueOf(s, 'env')), TELEMETRY)) add(pairOf(s, 'run').key, 'setup', 'npm step without env IBM_TELEMETRY_DISABLED: \'true\'');
  }
}

function checkWorkflow(root, policy, add) {
  if (policy.topKeys) {
    for (const p of root.items) if (!policy.topKeys.includes(keyOf(p))) add(p.key, 'top-keys', `top-level key ${keyOf(p)} is not allowed`);
  }
  if (policy.permissions) {
    const p = pairOf(root, 'permissions');
    if (!p || !equal(toJS(p.value), policy.permissions)) add(p?.key ?? root, 'permissions', `top-level permissions must be ${JSON.stringify(policy.permissions)}`);
  }
  if (policy.on) {
    const p = pairOf(root, 'on');
    if (!p || !equal(toJS(p.value), policy.on)) add(p?.key ?? root, 'on', `on must be exactly ${JSON.stringify(policy.on)}`);
  }
  const jobsPair = pairOf(root, 'jobs');
  if (!jobsPair || !isMap(jobsPair.value)) { add(jobsPair?.key ?? root, 'top-keys', 'jobs is not a mapping'); return; }
  const jobs = jobsPair.value.items;
  for (const jp of jobs) {
    const id = keyOf(jp);
    const job = jp.value;
    if (!isMap(job)) { add(jp.key, 'top-keys', `job ${id} is not a mapping`); continue; }
    const jobPolicy = policy.jobs?.[id];
    if (policy.jobs) {
      const perms = pairOf(job, 'permissions');
      if (!jobPolicy) add(jp.key, 'permissions', `job ${id} is not in the policy`);
      else if (jobPolicy.permissions === undefined ? perms : !equal(toJS(perms?.value), jobPolicy.permissions)) {
        add(perms?.key ?? jp.key, 'permissions', `job ${id}: permissions must be ${JSON.stringify(jobPolicy.permissions ?? 'absent')}`);
      }
    }
    if (jobPolicy?.required) {
      if (jobs.length !== 1) add(jp.key, 'required', `required job ${id} is not the only job in its file`);
      if (str(valueOf(job, 'name')) !== id) add(pairOf(job, 'name')?.key ?? jp.key, 'required', `required job ${id} must be named ${id}`);
      for (const p of job.items) if (!REQUIRED_JOB_KEYS.includes(keyOf(p))) add(p.key, 'required', `required job ${id}: key ${keyOf(p)} is not allowed`);
      const env = pairOf(job, 'env');
      if (jobPolicy.env === undefined ? env : !equal(toJS(env?.value), jobPolicy.env)) {
        add(env?.key ?? jp.key, 'required', `required job ${id}: env must be ${JSON.stringify(jobPolicy.env ?? 'absent')}`);
      }
    }
    const steps = stepsOf(job, add, `job ${id}`);
    if (jobPolicy?.required) {
      checkStepKeys(steps, jobPolicy.stepEnv ?? {}, add, `job ${id}`);
      // A required job checks out the PR's own code: no ref, repository or path input.
      for (const step of steps) {
        if (!/^actions\/checkout@/i.test(usesOf(step))) continue;
        const w = valueOf(step, 'with');
        for (const p of isMap(w) ? w.items : []) {
          if (!POLICY.requiredCheckoutInputs.includes(keyOf(p)?.toLowerCase())) add(p.key, 'required', `job ${id}: checkout input ${keyOf(p)} is not allowed`);
        }
      }
    }
    const allowed = jobPolicy?.scripts ?? policy.scripts;
    for (const step of steps) {
      const run = pairOf(step, 'run');
      if (allowed && run && str(run.value) !== undefined) checkScripts(run, allowed, add);
      if (/^actions\/setup-node@/i.test(usesOf(step))) add(pairOf(step, 'uses').key, 'setup', 'actions/setup-node outside the setup action');
    }
    // A job that runs npm checks out, then runs the setup action, with telemetry off.
    if (runsNpm(steps)) {
      const checkout = steps.findIndex((s) => /^actions\/checkout@/i.test(usesOf(s)));
      const setup = steps.findIndex((s) => usesOf(s) === SETUP_USES);
      if (checkout < 0 || setup < checkout) add(jp.key, 'setup', `job ${id} runs npm without checkout, then ${SETUP_USES}`);
      if (str(valueOf(valueOf(job, 'env'), 'IBM_TELEMETRY_DISABLED')) !== 'true') add(jp.key, 'setup', `job ${id} runs npm without env IBM_TELEMETRY_DISABLED: 'true'`);
    }
  }
  if (policy.buildEntry) {
    const { job: id, step: name, commands } = policy.buildEntry;
    const job = valueOf(jobsPair.value, id);
    const step = (isSeq(valueOf(job, 'steps')) ? valueOf(job, 'steps').items : []).find((s) => str(valueOf(s, 'name')) === name);
    const run = str(valueOf(step, 'run'));
    if (run === undefined) { add(jobsPair.key, 'build-entry', `no step "${name}" with a run in job ${id}`); return; }
    const where = pairOf(step, 'run').key;
    const npmRuns = run.split('\n').map((l) => l.trim()).filter((l) => /^npm run /.test(l));
    if (!equal(npmRuns, commands)) add(where, 'build-entry', `"${name}" runs ${JSON.stringify(npmRuns)}, not ${JSON.stringify(commands)}`);
    if (!/git status --porcelain[\s\S]*::error::/.test(run)) add(where, 'build-entry', `"${name}" lost its git status --porcelain drift check`);
  }
}

function checkDependabot(root, add) {
  const want = POLICY.dependabot;
  for (const p of root.items) if (!(keyOf(p) in want)) add(p.key, 'dependabot', `key ${keyOf(p)} is not in the policy`);
  const version = pairOf(root, 'version');
  if (!version || toJS(version.value) !== want.version) add(version?.key ?? root, 'dependabot', `version must be ${want.version}`);
  const updates = pairOf(root, 'updates');
  if (!updates || !isSeq(updates.value) || updates.value.items.length !== want.updates.length) {
    add(updates?.key ?? root, 'dependabot', `updates must be ${want.updates.length} entries: ${want.updates.map((u) => u['package-ecosystem']).join(', ')}`);
    return;
  }
  updates.value.items.forEach((u, i) => {
    if (!equal(toJS(u), want.updates[i])) add(u, 'dependabot', `updates[${i}] differs from the policy (${want.updates[i]['package-ecosystem']})`);
  });
}

// ---- the tree

// How a file under .github is checked, or null if it is not allowed there.
export function classify(file) {
  let m;
  if ((m = /^\.github\/workflows\/([^/]+\.ya?ml)$/.exec(file))) return POLICY.workflows[m[1]] ? { kind: 'workflow', policy: POLICY.workflows[m[1]] } : null;
  if (/^\.github\/actions\/[^/]+\/action\.yml$/.test(file)) return { kind: 'action' };
  if (file === '.github/dependabot.yml') return { kind: 'dependabot' };
  if (file === '.github/ISSUE_TEMPLATE/config.yml') return { kind: 'subset' };
  return null;
}

// Checks every YAML file under .github. `files`: [{ path, src }], paths relative to the
// repository root with `/`. Returns { findings, pins, installs }.
export function checkTree(files) {
  const findings = [];
  const pins = [];
  // In scope: every YAML file under .github, the extension compared case-insensitively, and
  // every file in .github/workflows whatever its extension.
  const yamlFiles = files.filter((f) => f.path.startsWith('.github/') && (/\.ya?ml$/i.test(f.path) || f.path.startsWith('.github/workflows/')))
    .sort((a, b) => a.path.localeCompare(b.path));
  const actions = new Set(yamlFiles.filter((f) => classify(f.path)?.kind === 'action').map((f) => `./${path(f.path)}`));
  for (const name of Object.keys(POLICY.workflows)) {
    if (!yamlFiles.some((f) => f.path === `.github/workflows/${name}`)) findings.push({ file: `.github/workflows/${name}`, line: 1, rule: 'scope', message: 'a policy entry without a workflow' });
  }
  for (const f of yamlFiles) {
    const c = classify(f.path);
    if (!c) { findings.push({ file: f.path, line: 1, rule: 'scope', message: 'a YAML file under .github, or a file in .github/workflows, that no rule covers (a new workflow needs a policy entry)' }); continue; }
    findings.push(...checkFile(f.path, f.src, { ...c, actions, pins }));
  }
  // The one install: `npm ci --ignore-scripts`, once, in the setup action.
  const installs = [];
  for (const f of yamlFiles) {
    const c = classify(f.path);
    if (!c || !['workflow', 'action'].includes(c.kind)) continue;
    const { doc, line } = parseYaml(f.path, f.src);
    if (!doc) continue;
    for (const { pair } of pairs(doc.contents)) {
      const run = keyOf(pair) === 'run' ? str(pair.value) : undefined;
      if (run === undefined) continue;
      for (const { word, rest } of commandWords(run)) {
        if (word === 'npm' && /^[ \t]*ci(?:\s|$)/.test(rest)) installs.push({ file: f.path, line: line(pair.key.range[0]) });
      }
    }
  }
  if (installs.length !== 1 || installs[0].file !== SETUP_ACTION) {
    findings.push({ file: SETUP_ACTION, line: 1, rule: 'npm', message: `npm ci runs ${installs.length} times (${installs.map((i) => `${i.file}:${i.line}`).join(', ')}); exactly once, in the setup action` });
  }
  // Every occurrence of an action pins the same SHA and comment (actions compared case-insensitively).
  const byAction = Map.groupBy(pins, (p) => p.action);
  for (const [action, list] of byAction) {
    for (const p of list) {
      if (p.sha !== list[0].sha || p.comment !== list[0].comment) {
        findings.push({ file: p.file, line: p.line, rule: 'pin', message: `${action}@${p.sha} #${p.comment} differs from ${list[0].file} (${list[0].sha} #${list[0].comment})` });
      }
    }
  }
  return { findings, pins, installs };
}

const path = (file) => file.slice(0, file.lastIndexOf('/'));
