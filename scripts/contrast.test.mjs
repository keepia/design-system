// Contrast checks for both Carbon themes (keepia/mail#7, part 2): `npm test` fails when a brand
// pair falls below 4.5:1 for text or 3:1 for non-text UI and the logo tile. The pairs and the
// evaluation are in scripts/contrast.mjs; scripts/build.mjs writes the same evaluation to
// theme/contrast-report.json.
//
// Failure rule: a pair below its minimum fails if either token is one the Keepia theme changes.
// A pair of two unchanged Carbon values is exempt, but the exempt list is pinned here exactly,
// so a new failing pair fails either way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRS, RINGS, RING_GROUNDS, TEXT, UI, evaluate, keyOf, luminance, ratio, round2, touchesChanged } from './contrast.mjs';

const require = createRequire(import.meta.url);
const colors = require('@carbon/colors');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const tokens = JSON.parse(read('theme/tokens.json'));
const rows = evaluate(tokens);
const find = (theme, fg, ground) => {
  const r = rows.find((x) => x.theme === theme && x.fg === fg && x.ground === ground);
  assert.ok(r, `no pair ${theme} ${fg}/${ground}`);
  return r;
};

// The failing pairs of two unchanged Carbon values (Carbon's own White warning colour).
const EXEMPT = [
  'light support-warning/background',
  'light support-warning/layer-01',
];
// Pairs with a translucent rgba() token, which are not rated (as in pklnx/design-system).
const UNRATED = [
  'dark text-placeholder/field-01',
  'light text-placeholder/field-01',
];

test('the WCAG 2.x ratio: black on white 21, a colour on itself 1, symmetric', () => {
  assert.equal(TEXT, 4.5);
  assert.equal(UI, 3);
  assert.equal(ratio('#000000', '#ffffff'), 21);
  assert.equal(ratio('#007d79', '#007d79'), 1);
  assert.equal(ratio('#ffffff', '#007d79'), ratio('#007d79', '#ffffff'));
  assert.equal(luminance('rgba(0, 0, 0, 0.5)'), null);
  assert.equal(round2(4.994), 4.99);
});

test('theme/contrast-report.json is the evaluation of theme/tokens.json', () => {
  assert.deepEqual(JSON.parse(read('theme/contrast-report.json')), rows);
});

test('no pair with a token the theme changes is below its minimum', () => {
  const bad = rows.filter((r) => r.ok === false && touchesChanged(r, tokens.changed));
  assert.deepEqual(bad.map((r) => `${keyOf(r)} ${r.ratio} < ${r.min}`), []);
});

test('the failing pairs are exactly the pinned exempt list, all of unchanged Carbon values', () => {
  const failing = rows.filter((r) => r.ok === false);
  assert.deepEqual(failing.map(keyOf).sort(), [...EXEMPT].sort());
  for (const r of failing) assert.ok(!touchesChanged(r, tokens.changed), `${keyOf(r)} touches a changed token`);
});

test('the unrated pairs are exactly the pinned list, none with a changed token', () => {
  const unrated = rows.filter((r) => r.ok === null);
  assert.deepEqual(unrated.map(keyOf).sort(), [...UNRATED].sort());
  for (const r of unrated) assert.ok(!touchesChanged(r, tokens.changed), `${keyOf(r)} touches a changed token`);
});

test('every pair of the plan is checked, in both themes, with its minimum', () => {
  const plan = [
    // From pklnx/design-system (without star).
    ['text-primary', 'background', TEXT], ['text-primary', 'layer-01', TEXT], ['text-primary', 'layer-02', TEXT], ['text-primary', 'field-01', TEXT],
    ['text-secondary', 'background', TEXT], ['text-secondary', 'layer-01', TEXT], ['text-secondary', 'layer-02', TEXT], ['text-secondary', 'field-01', TEXT],
    ['text-helper', 'background', TEXT], ['text-helper', 'layer-01', TEXT], ['text-helper', 'layer-02', TEXT],
    ['text-error', 'background', TEXT], ['text-error', 'layer-01', TEXT],
    ['link-primary', 'background', TEXT], ['link-primary', 'layer-01', TEXT], ['link-primary', 'layer-02', TEXT],
    ['link-primary-hover', 'background', TEXT], ['link-primary-hover', 'layer-01', TEXT],
    ['text-on-color', 'button-primary', TEXT], ['text-on-color', 'button-primary-hover', TEXT],
    ['text-on-color', 'background-brand', TEXT], ['text-on-color', 'button-danger-primary', TEXT],
    ['focus', 'background', UI], ['focus', 'layer-01', UI], ['focus', 'layer-02', UI],
    ['border-strong-01', 'background', UI], ['border-strong-01', 'layer-01', UI],
    ['icon-primary', 'background', UI], ['icon-primary', 'layer-01', UI],
    ['icon-secondary', 'background', UI], ['icon-secondary', 'layer-01', UI],
    ['support-success', 'background', UI], ['support-success', 'layer-01', UI],
    ['support-warning', 'background', UI], ['support-warning', 'layer-01', UI],
    ['support-error', 'background', UI], ['support-error', 'layer-01', UI],
    ['text-placeholder', 'field-01', TEXT],
    // Added for Keepia.
    ['link-secondary', 'background', TEXT], ['link-secondary', 'layer-01', TEXT],
    ['link-inverse', 'background-inverse', TEXT], ['link-inverse-hover', 'background-inverse', TEXT],
    ['text-on-color', 'button-primary-active', TEXT],
    ['button-tertiary', 'background', TEXT], ['button-tertiary', 'layer-01', TEXT],
    ...['interactive', 'border-interactive', 'icon-interactive'].flatMap((fg) => ['background', 'layer-01', 'field-01'].map((g) => [fg, g, UI])),
    ['focus-inverse', 'background-inverse', UI],
    ['focus|focus-inset', 'button-primary', UI], ['focus|focus-inset', 'button-primary-hover', UI], ['focus|focus-inset', 'button-primary-active', UI],
    ['background-brand', 'background', UI], ['background-brand', 'layer-01', UI],
  ];
  for (const theme of ['light', 'dark']) for (const [fg, g, min] of plan) assert.equal(find(theme, fg, g).min, min, `${theme} ${fg}/${g}`);
  assert.equal(rows.length, plan.length * 2, 'no pair beyond the plan');
  for (const [, , min] of PAIRS) assert.ok(min === TEXT || min === UI);
});

test('the four decided ratios: 4.99, 4.99, 7.75 and 3.63', () => {
  const teal = (s) => colors[`teal${s}`].toLowerCase();
  // The palette values behind the decision (keepia/mail#7, comment 6807108738).
  assert.equal(round2(ratio('#ffffff', teal(60))), 4.99, 'white on Teal 60');
  assert.equal(round2(ratio(teal(60), '#ffffff')), 4.99, 'Teal 60 on White');
  assert.equal(round2(ratio(teal(40), '#161616')), 7.75, 'Teal 40 on #161616');
  assert.equal(round2(ratio(teal(60), '#161616')), 3.63, 'Teal 60 on #161616');
  // The same pairs as the theme uses them.
  assert.equal(tokens.light.background, '#ffffff');
  assert.equal(tokens.dark.background, '#161616');
  assert.equal(find('light', 'text-on-color', 'button-primary').ratio, 4.99);
  assert.equal(find('light', 'link-primary', 'background').ratio, 4.99);
  assert.equal(find('dark', 'link-primary', 'background').ratio, 7.75);
  assert.equal(find('dark', 'background-brand', 'background').ratio, 3.63);
  assert.equal(round2(ratio(tokens.dark['button-primary'], tokens.dark.background)), 3.63);
});

test('the button focus ring: White focus on button-primary is 1.00, the inner ring carries it with 4.99', () => {
  assert.deepEqual(RINGS, [['focus', 'focus-inset']]);
  assert.deepEqual(RING_GROUNDS, ['button-primary', 'button-primary-hover', 'button-primary-active']);
  const t = tokens.light;
  assert.equal(round2(ratio(t.focus, t['button-primary'])), 1);
  assert.equal(round2(ratio(t['focus-inset'], t['button-primary'])), 4.99);
  const expected = { light: [4.99, 6.36, 11.42], dark: [4.99, 6.36, 11.42] };
  for (const theme of ['light', 'dark']) {
    assert.deepEqual(RING_GROUNDS.map((g) => find(theme, 'focus|focus-inset', g).ratio), expected[theme], theme);
    for (const g of RING_GROUNDS) assert.equal(find(theme, 'focus|focus-inset', g).ok, true);
  }
});

test('the logo tile: 3:1 on the allowed grounds; G100 layer-02 (2.32) is excluded by the usage rule', () => {
  assert.deepEqual(PAIRS.filter(([fg]) => fg === 'background-brand').map(([, g]) => g), [['background', 'layer-01']]);
  assert.deepEqual(['background', 'layer-01'].map((g) => find('light', 'background-brand', g).ratio), [4.99, 4.54]);
  assert.deepEqual(['background', 'layer-01'].map((g) => find('dark', 'background-brand', g).ratio), [3.63, 3.03]);
  assert.equal(round2(ratio(tokens.dark['background-brand'], tokens.dark['layer-02'])), 2.32);
  assert.equal(find('light', 'text-on-color', 'background-brand').ratio, 4.99, 'the white mark on the tile');
  const logo = /^## Logo\n([\s\S]*?)(?=^## )/m.exec(read('README.md'));
  assert.ok(logo, 'README "Logo" section');
  assert.match(logo[1], /G100.*only on `background` or `layer-01`/, 'README states the tile usage rule');
});

test('the tightest values of the plan', () => {
  assert.equal(find('light', 'link-primary', 'layer-01').ratio, 4.54);
  assert.equal(find('dark', 'link-primary', 'layer-02').ratio, 4.95);
  assert.equal(find('dark', 'interactive', 'layer-01').ratio, 4.53);
  assert.equal(find('dark', 'background-brand', 'layer-01').ratio, 3.03);
});
