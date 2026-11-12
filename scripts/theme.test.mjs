// Checks the generated theme (keepia/mail#7, part 2):
// - theme/tokens.json against Carbon: every Blue step outside the kept groups is the same Teal
//   step (maintainer decision M1), everything else is Carbon's value, and the changed tokens are
//   exactly the decided table;
// - theme/keepia-carbon.css and the Sass module theme/_index.scss against theme/tokens.json
//   (port of pklnx/design-system scripts/theme.test.mjs). Both theme blocks set the same tokens:
//   the light selector includes :root, which also matches <html class="cds--g100">, so a token
//   set only in the light block would leak into dark mode;
// - fonts/ and THIRD_PARTY_NOTICES.md against the installed packages.
// The contrast pairs are checked in contrast.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

const require = createRequire(import.meta.url);
const themes = require('@carbon/themes');
const colors = require('@carbon/colors');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const tokens = JSON.parse(read('theme/tokens.json'));

// The decided colour (keepia/mail#7, comments 6807108738 and 6807897848). Spelled out here, not
// read from theme/brand.json, so a changed brand.json fails the tests.
const HUE = 'teal';
const KEEP = /^(support-|syntax-|ai-|tag-|status-|notification-background-info)/;

// The tokens that differ from Carbon, with their values: the plan's table (keepia/mail#7,
// comment 6807557665, part 2). 20 in White, 19 in G100, 24 names in all.
const T = (step) => colors[`${HUE}${step}`].toLowerCase();
const CHANGED = {
  light: {
    'interactive': T(60), 'border-interactive': T(60), 'focus': T(60), 'icon-interactive': T(60),
    'link-primary': T(60), 'link-primary-hover': T(70), 'link-secondary': T(70),
    'link-inverse': T(40), 'link-inverse-hover': T(30),
    'button-primary': T(60), 'button-primary-hover': T('60Hover'), 'button-primary-active': T(80),
    'button-tertiary': T(60), 'button-tertiary-hover': T('60Hover'), 'button-tertiary-active': T(80),
    'background-brand': T(60), 'highlight': T(20),
    'chat-avatar-user': T(60), 'chat-button': T(60), 'chat-button-text-hover': T(70),
  },
  dark: {
    'interactive': T(50), 'border-interactive': T(50),
    'link-primary': T(40), 'link-primary-hover': T(30), 'link-secondary': T(30),
    'link-inverse': T(60), 'link-inverse-hover': T(70), 'focus-inverse': T(60),
    'button-primary': T(60), 'button-primary-hover': T('60Hover'), 'button-primary-active': T(80),
    'background-brand': T(60), 'highlight': T(90),
    'chat-avatar-user': T(50), 'chat-button': T(40), 'chat-button-text-hover': T(30),
    'notification-action-tertiary-inverse': T(60), 'notification-action-tertiary-inverse-hover': T('60Hover'),
    'notification-action-tertiary-inverse-active': T(80),
  },
};

// Every Carbon colour token of a theme, read independently of scripts/build.mjs.
function carbonTokens(theme, key) {
  const isColor = (v) => typeof v === 'string' && /^(#|rgba?\()/i.test(v.trim());
  const out = {};
  for (const [k, v] of Object.entries(theme)) if (isColor(v)) out[themes.formatTokenName(k)] = v.toLowerCase();
  for (const group of ['buttonTokens', 'notificationTokens', 'contentSwitcherTokens', 'tagTokens', 'statusTokens']) {
    for (const [k, v] of Object.entries(themes[group])) if (isColor(v[key])) out[themes.formatTokenName(k)] = v[key].toLowerCase();
  }
  return out;
}
const CARBON = { light: carbonTokens(themes.white, 'whiteTheme'), dark: carbonTokens(themes.g100, 'g100') };

// Carbon's Blue steps, value → step ("60", "60Hover").
const BLUE = new Map();
for (const [k, v] of Object.entries(colors)) {
  const m = /^blue(\d+(?:Hover)?)$/.exec(k);
  if (m && typeof v === 'string') BLUE.set(v.toLowerCase(), m[1]);
}

test('tokens.json: every Blue step outside the kept groups is the same Teal step, everything else is Carbon', () => {
  for (const theme of ['light', 'dark']) {
    assert.deepEqual(Object.keys(tokens[theme]).sort(), Object.keys(CARBON[theme]).sort(), `${theme}: the token names are Carbon's`);
    const expected = {};
    for (const [name, v] of Object.entries(CARBON[theme])) {
      const step = KEEP.test(name) ? undefined : BLUE.get(v);
      if (step) expected[name] = T(step);
      assert.equal(tokens[theme][name], step ? T(step) : v, `${theme} ${name}`);
    }
    assert.deepEqual(tokens.changed[theme], expected, `${theme}: changed lists exactly the swapped tokens`);
  }
});

test('tokens.json: the changed tokens are the decided table (20 White, 19 G100, 24 names)', () => {
  assert.deepEqual(tokens.changed, CHANGED);
  assert.equal(Object.keys(CHANGED.light).length, 20);
  assert.equal(Object.keys(CHANGED.dark).length, 19);
  assert.equal(new Set([...Object.keys(CHANGED.light), ...Object.keys(CHANGED.dark)]).size, 24);
  assert.equal(JSON.parse(read('theme/brand.json')).primary, HUE);
});

test('tokens.json: G100 focus and interactive icon stay Carbon white (decision N2); kept groups stay Carbon', () => {
  assert.equal(tokens.dark.focus, '#ffffff');
  assert.equal(tokens.dark['icon-interactive'], '#ffffff');
  assert.equal(tokens.dark['button-tertiary'], '#ffffff');
  for (const theme of ['light', 'dark']) {
    assert.equal(tokens[theme]['notification-background-info'], CARBON[theme]['notification-background-info']);
    assert.equal(tokens[theme]['support-info'], CARBON[theme]['support-info']);
  }
});

test('tokens.json: visited links are Carbon\'s Purple and there is no star token', () => {
  assert.equal(tokens.light['link-visited'], '#8a3ffc');
  assert.equal(tokens.dark['link-visited'], '#be95ff');
  for (const theme of ['light', 'dark']) {
    assert.equal(tokens[theme]['link-inverse-visited'], CARBON[theme]['link-inverse-visited']);
    assert.ok(!('star' in tokens[theme]), `${theme} has a star token`);
  }
  assert.doesNotMatch(read('theme/keepia-carbon.css'), /star/);
  assert.doesNotMatch(read('theme/_index.scss'), /star/);
});

// Parses `selector { --name: value; ... }` rules into [{ selector, props: Map }].
function parseRules(css) {
  const rules = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const props = new Map();
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const name = d.slice(0, i).trim();
      assert.ok(!props.has(name), `${name} set twice in ${m[1].trim()}`);
      props.set(name, d.slice(i + 1).trim());
    }
    rules.push({ selector: m[1].trim().replace(/\s+/g, ' '), props });
  }
  return rules;
}

// Every declaration of a theme block equals tokens.json for that theme.
function assertMatchesTokens(props, theme) {
  for (const [name, value] of props) {
    const m = /^--cds-(.+)$/.exec(name);
    assert.ok(m, `${theme}: unexpected property ${name}`);
    assert.ok(m[1] in tokens[theme], `${theme}: ${name} is not a token of tokens.json`);
    assert.equal(value, tokens[theme][m[1]], `${theme} ${name}`);
  }
}

const sortedKeys = (props) => [...props.keys()].sort();
const overrideNames = () => [...new Set([...Object.keys(tokens.changed.light), ...Object.keys(tokens.changed.dark)])].map((k) => `--cds-${k}`).sort();

function cssBlocks() {
  const rules = parseRules(read('theme/keepia-carbon.css'));
  assert.equal(rules.length, 2);
  const [light, dark] = rules;
  assert.equal(light.selector, ':root, .cds--white, [data-theme="light"]');
  assert.equal(dark.selector, '.cds--g100, [data-theme="dark"]');
  return { light: light.props, dark: dark.props };
}

test('keepia-carbon.css: both blocks set exactly the 24 changed names', () => {
  const { light, dark } = cssBlocks();
  assert.deepEqual(sortedKeys(light), overrideNames());
  assert.deepEqual(sortedKeys(dark), overrideNames());
  assert.equal(light.size, 24);
});

test('keepia-carbon.css: every value equals tokens.json for its theme', () => {
  const { light, dark } = cssBlocks();
  assertMatchesTokens(light, 'light');
  assertMatchesTokens(dark, 'dark');
});

test('_index.scss: the override mixins set the same tokens with the tokens.json values', () => {
  const css = sass.compileString(
    "@use 'theme' as keepia;\n.l { @include keepia.overrides-light; }\n.d { @include keepia.overrides-dark; }\n",
    { loadPaths: [ROOT, path.join(ROOT, 'node_modules')], quietDeps: true },
  ).css;
  const rules = parseRules(css);
  const light = rules.find((r) => r.selector === '.l').props;
  const dark = rules.find((r) => r.selector === '.d').props;
  assert.deepEqual(sortedKeys(light), overrideNames());
  assert.deepEqual(sortedKeys(dark), overrideNames());
  assertMatchesTokens(light, 'light');
  assertMatchesTokens(dark, 'dark');
});

test('_index.scss: $white and $g100 are Carbon\'s theme maps with the overrides merged in', () => {
  const names = ['link-primary', 'interactive', 'focus', 'background', 'text-primary'];
  const css = sass.compileString(
    `@use 'sass:map';\n@use 'theme' as keepia;\n${['white', 'g100'].map((t) => `.${t} { ${names.map((n) => `--${n}: #{map.get(keepia.$${t}, '${n}')};`).join(' ')} }`).join('\n')}\n`,
    { loadPaths: [ROOT, path.join(ROOT, 'node_modules')], quietDeps: true },
  ).css;
  const rules = parseRules(css);
  for (const [cls, theme] of [['.white', 'light'], ['.g100', 'dark']]) {
    const props = rules.find((r) => r.selector === cls).props;
    for (const n of names) assert.equal(props.get(`--${n}`), tokens[theme][n], `${cls} ${n}`);
  }
});

test('fonts/: the six IBM Plex woff2 files and OFL.txt, byte-equal to the installed packages', () => {
  const files = {
    'IBMPlexSans-Light.woff2': 'plex-sans', 'IBMPlexSans-Regular.woff2': 'plex-sans', 'IBMPlexSans-Italic.woff2': 'plex-sans',
    'IBMPlexSans-SemiBold.woff2': 'plex-sans', 'IBMPlexMono-Regular.woff2': 'plex-mono', 'IBMPlexMono-SemiBold.woff2': 'plex-mono',
  };
  assert.deepEqual(readdirSync(path.join(ROOT, 'fonts')).sort(), [...Object.keys(files), 'OFL.txt'].sort());
  for (const [f, pkg] of Object.entries(files)) {
    assert.ok(readFileSync(path.join(ROOT, 'fonts', f)).equals(readFileSync(path.join(ROOT, 'node_modules/@ibm', pkg, 'fonts/complete/woff2', f))), f);
  }
  assert.match(read('fonts/OFL.txt'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('THIRD_PARTY_NOTICES.md names the shipped packages at their installed versions', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');
  const v = (n) => require(`${n}/package.json`).version;
  assert.ok(notices.includes(`| @carbon/colors | ${v('@carbon/colors')} | Apache-2.0 |`));
  assert.ok(notices.includes(`| @carbon/themes | ${v('@carbon/themes')} | Apache-2.0 |`));
  // The VitePress theme (keepia/mail#7, part 4): Carbon's font stacks and four Carbon icons.
  assert.ok(notices.includes(`| @carbon/type | ${v('@carbon/type')} | Apache-2.0 | theme/vitepress.css (font stacks) |`));
  assert.ok(notices.includes(`| @carbon/icons | ${v('@carbon/icons')} | Apache-2.0 | theme/vitepress.css (custom-block icons) |`));
  assert.ok(notices.includes(`| ${v('@ibm/plex-sans')}, ${v('@ibm/plex-mono')} | OFL-1.1 | fonts/ |`));
  assert.match(notices, /Apache License\s+Version 2\.0/);
  assert.match(notices, /SIL OPEN FONT LICENSE Version 1\.1/);
});
