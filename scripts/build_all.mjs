// The one entry point that generates every committed generated file, in the one order that
// matches their data dependencies (as pklnx/design-system's scripts/build_all.mjs). README
// "Building" and the CI step "Generated files are committed" both call it; neither lists the
// steps itself.
//
//   npm run build:all
//
// Part 2 of keepia/mail#7 adds the theme (build.mjs: tokens, Carbon overrides, contrast report,
// fonts, notices). Part 3 adds the logo: build_logo.mjs (geometry and brand SVGs, colours from
// tokens.json), build_previews.mjs (the sign-off sheets, from the brand SVGs) and render_pngs.mjs
// (PNGs, favicon.ico and the manifest, from all SVGs). The VitePress theme (part 4) adds its step
// after the steps whose output it reads. All steps are Node scripts.
//
// The script stops at the first failing step and exits non-zero.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The scripts, relative to the repository root, in their order.
export const STEPS = ['scripts/build.mjs', 'scripts/build_logo.mjs', 'scripts/build_previews.mjs', 'scripts/render_pngs.mjs'];

// The step as the command a person types: node scripts/build.mjs.
export const commandOf = (script) => `node ${script}`;

// Runs the steps in order with this Node and returns the exit code: 0, or the first failing
// step's code (1 when it could not start or was killed). `spawn` is injectable for the tests.
export function runSteps(steps, { env = process.env, spawn = spawnSync, log = console.log, error = console.error } = {}) {
  for (const [i, script] of steps.entries()) {
    log(`build:all [${i + 1}/${steps.length}] ${commandOf(script)}`);
    const r = spawn(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, stdio: 'inherit', env });
    if (r.error || r.status !== 0) {
      error(`build:all: step ${i + 1} failed: ${commandOf(script)}${r.error ? ` (${r.error.message})` : ` (exit ${r.status ?? r.signal})`}`);
      return r.status || 1;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(runSteps(STEPS));
