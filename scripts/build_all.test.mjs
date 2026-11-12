// Tests of the generation entry point scripts/build_all.mjs (ported from pklnx/design-system):
// no generator is missing from STEPS, the steps run in order, and a failing step stops the run
// with a non-zero exit code. README and CI are checked against STEPS in workflows.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, STEPS, commandOf, runSteps } from './build_all.mjs';

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('the steps are the theme build (keepia/mail#7, part 2), then the VitePress theme (part 4), which reads its tokens', () => {
  assert.deepEqual(STEPS, ['scripts/build.mjs', 'scripts/build_vitepress.mjs']);
});

test('every generator script in scripts/ is a step, and nothing else is', () => {
  const generators = readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => /^(?:build(?:_[a-z_]+)?|render_[a-z_]+)\.mjs$/.test(f) && f !== 'build_all.mjs')
    .map((f) => `scripts/${f}`).sort();
  assert.deepEqual([...STEPS].sort(), generators);
});

test('package.json runs the entry point as build:all', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(scripts['build:all'], 'node scripts/build_all.mjs');
});

// Steps for the runner tests; they never run (the spawn is a stand-in).
const SAMPLE = ['scripts/a.mjs', 'scripts/b.mjs', 'scripts/c.mjs'];

// A stand-in for spawnSync that records the calls and fails the n-th one.
function fake(failAt, result = { status: 1 }) {
  const calls = [];
  const spawn = (exe, args) => {
    calls.push([exe, ...args]);
    return calls.length === failAt ? result : { status: 0 };
  };
  const out = [];
  return { calls, out, opts: { spawn, log: () => {}, error: (m) => out.push(m) } };
}

test('runSteps with no steps runs nothing and returns 0', () => {
  const a = fake(0);
  assert.equal(runSteps([], { env: {}, ...a.opts }), 0);
  assert.deepEqual(a.calls, []);
});

test('runSteps runs every step in order with this Node', () => {
  const a = fake(0);
  assert.equal(runSteps(SAMPLE, { env: {}, ...a.opts }), 0);
  assert.deepEqual(a.calls.map(([exe, script]) => [exe, path.relative(ROOT, script)]), SAMPLE.map((s) => [process.execPath, s]));
  assert.equal(commandOf('scripts/a.mjs'), 'node scripts/a.mjs');
});

test('runSteps stops at the first failing step and returns its non-zero exit code', () => {
  const a = fake(2, { status: 7 });
  assert.equal(runSteps(SAMPLE, { env: {}, ...a.opts }), 7);
  assert.equal(a.calls.length, 2, 'the steps after the failing one do not run');
  assert.match(a.out[0], /step 2 failed: node scripts\/b\.mjs \(exit 7\)/);
});

test('runSteps fails when a step cannot start or is killed', () => {
  const a = fake(1, { error: new Error('spawn node ENOENT'), status: null });
  assert.equal(runSteps(SAMPLE, { env: {}, ...a.opts }), 1);
  assert.equal(a.calls.length, 1);
  assert.match(a.out[0], /ENOENT/);
  const b = fake(2, { status: null, signal: 'SIGKILL' });
  assert.equal(runSteps(SAMPLE, { env: {}, ...b.opts }), 1);
  assert.match(b.out[0], /SIGKILL/);
});
