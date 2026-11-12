// Checks theme/vitepress.css against theme/tokens.json, scripts/vitepress-map.mjs and the
// VitePress fixture (scripts/fixtures/vitepress-<version>.json, captured from the npm
// tarball by scripts/capture-vitepress-fixture.mjs; no network here). Ported from
// pklnx/design-system (keepia/mail#7, part 4).
//
//   - structure: two custom-property blocks (:root, .dark) with the same variables,
//     @font-face, flat selector rules; no nested at-rules
//   - colours: each value is its mapped token; a few literals pinned
//   - contrast: every pair VitePress renders with the mapped variables, the double focus
//     ring, and the brand-soft guard (no rule paints brand-1 text on brand-soft)
//   - overrides: every VitePress rule that sets a corner, an outline or a font is
//     overridden (and the override wins) or kept with a reason (and still wins where it
//     is a focus rule)
//   - fonts: every url() resolves to a font file in fonts/ that the package ships
//     (EXPECTED_FILES of scripts/check-pack.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { COLOR_PROPERTIES, rootClasses } from './capture-vitepress-fixture.mjs';
import { EXPECTED_FILES } from './check-pack.mjs';
// lightningcss is an exact pin in package.json (README, "Building" says why).
import { transform as lightningTransform } from 'lightningcss';
import {
  compareSpecificity, compoundsOf, elementOf, formatSpecificity, parseCss, selectorMatches, selectorMatchesPath, specificity, splitTopLevel, subjectCompound,
} from './css-selectors.mjs';
import {
  BLOCK_ICONS, CLASSIFIED, CLASSIFIED_GROUPS, CORNERS, CUSTOM_BLOCK_ELEMENTS, DOCSEARCH_CSS_RANGE, DOCSEARCH_CSS_VERSION, DOCSEARCH_MAP, DOCSEARCH_PAIRS, DOCSEARCH_SCOPED, DOCSEARCH_SELECTED_HIT, DOCSEARCH_SELECTORS, FONT_FACES, ICON_MODULES, KEPT, LEGAL_COMMENT, MAP, iconNotice, PAIRS, RINGS, RING_GROUNDS, RULES, STRIPES, VITEPRESS_VERSION, isTargetValue, staticProperties,
} from './vitepress-map.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const CSS_PATH = 'theme/vitepress.css';
const tokens = JSON.parse(read('theme/tokens.json'));
const brandPrimary = JSON.parse(read('theme/brand.json')).primary;
// Carbon's font stacks (@carbon/type), read here independently of the build.
const carbonFamilies = requireFromRoot('@carbon/type').fontFamilies;
const families = { sans: carbonFamilies.sans.replace(/'/g, '"'), mono: carbonFamilies.mono.replace(/'/g, '"') };
const fixture = JSON.parse(read(`scripts/fixtures/vitepress-${VITEPRESS_VERSION}.json`));
const parsed = parseCss(read(CSS_PATH));

const norm = (s) => splitTopLevel(s, ',').map((x) => x.replace(/\s+/g, ' ').trim()).join(', ');
const declText = (d) => `${d.prop}: ${d.value}${d.important ? ' !important' : ''}`;
const isCustom = (d) => d.prop.startsWith('--');
// '#0043ce', 0.4 → 'rgba(0, 67, 206, 0.4)' (written here again, not imported from the map).
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

// The rules of vitepress.css that set custom properties, selected by selector.
function variableBlock(selector) {
  const blocks = parsed.rules.filter((r) => r.selector === selector && r.decls.some(isCustom));
  assert.equal(blocks.length, 1, `exactly one ${selector} block with custom properties`);
  const props = new Map();
  for (const d of blocks[0].decls) {
    assert.ok(isCustom(d), `${selector} sets ${d.prop}, which is not a custom property`);
    assert.ok(!props.has(d.prop), `${d.prop} set twice in ${selector}`);
    props.set(d.prop, d.value);
  }
  return props;
}
const blocks = () => ({ light: variableBlock(':root'), dark: variableBlock('.dark') });

// Every selector alternative of every selector rule in vitepress.css, with its declarations.
// `order` is the source order of the rule.
const keepiaAlternatives = parsed.rules.filter((r) => !r.decls.some(isCustom)).flatMap((r, order) => splitTopLevel(r.selector, ',').map((alt) => ({
  rule: r, selector: alt, spec: specificity(alt), decls: r.decls, order,
})));
// The Keepia declaration of `prop` that applies to `el` among all of vitepress.css:
// !important first, then specificity, then the later rule.
function keepiaWinner(prop, el) {
  const candidates = keepiaAlternatives.filter((a) => selectorMatches(a.selector, el))
    .flatMap((a) => a.decls.filter((d) => d.prop === prop).map((d) => ({ alt: a, decl: d })));
  candidates.sort((x, y) => (Number(y.decl.important) - Number(x.decl.important)) || compareSpecificity(y.alt.spec, x.alt.spec) || (y.alt.order - x.alt.order));
  return candidates[0] ?? null;
}
const findRule = (selectors) => {
  const want = norm(selectors.join(', '));
  const found = parsed.rules.filter((r) => norm(r.selector) === want);
  assert.equal(found.length, 1, `vitepress.css has one rule for ${want}`);
  return found[0];
};

const key = (file, selector, property) => `${file}|${selector}|${property}`;
const fixtureRules = (file, selector) => fixture.rules.filter((r) => r.file === file && r.selector === selector);
const withStates = (el) => ({ states: ['focus', 'focus-visible', 'hover'], ...el });
// Border properties (not the radius) count where they reach a custom block.
const isBorder = (prop) => prop.startsWith('border') && prop !== 'border-radius';
const BLOCK_ELEMENTS = CUSTOM_BLOCK_ELEMENTS.map(withStates);
const needsClassification = (r) => (CLASSIFIED.includes(r.property) && !isTargetValue(r.property, r.value))
  || (isBorder(r.property) && BLOCK_ELEMENTS.some((el) => selectorMatches(r.selector, el)));
// A Keepia property overrides the same property; the first property of a CLASSIFIED_GROUPS
// group overrides the others (border-radius its longhands, outline outline-style and
// -width, font-family the family the font shorthand sets); border-left overrides the left
// side of the border shorthands (border-inline-start is the left side in the products' LTR docs).
const LEFT_SIDE = ['border', 'border-color', 'border-width', 'border-style', 'border-left', 'border-left-color', 'border-left-width', 'border-left-style',
  'border-inline', 'border-inline-color', 'border-inline-width', 'border-inline-style', 'border-inline-start', 'border-inline-start-color', 'border-inline-start-width', 'border-inline-start-style'];
const overridesProp = (ours, theirs) => ours === theirs || (ours === 'border-left' && LEFT_SIDE.includes(theirs))
  || Object.values(CLASSIFIED_GROUPS).some(([first, ...rest]) => ours === first && rest.includes(theirs));
const alternatives = (selector) => splitTopLevel(selector, ',');
const listMatches = (selector, el) => alternatives(selector).some((a) => selectorMatches(a, el));
// The alternative of a selector list that applies to `el`: the most specific one that matches.
function applyingAlternative(selector, el) {
  const matching = alternatives(selector).filter((a) => selectorMatches(a, el));
  return matching.sort((a, b) => compareSpecificity(specificity(b), specificity(a)))[0] ?? null;
}

// The elements r's selector sits in: for a scoped rule, the root element of its component
// (componentRoots in the fixture), unless the selector's first compound is that root.
function contextOf(r) {
  const root = r.scoped ? fixture.componentRoots[r.file] : null;
  if (!root || root.every((c) => compoundsOf(r.selector)[0].classes.includes(c))) return [];
  return [{ tag: null, classes: root, attrs: {}, states: ['focus', 'focus-visible', 'hover'] }];
}

// The elements r's selector describes, from the outermost down, one per compound. An element
// has gapAbove where r allows other elements between it and the one before: after a
// descendant combinator, and for the first compound (below the component root). A compound
// before a sibling combinator (+, ~) names a sibling, not an ancestor, so it is left out, and
// the element after it takes the sibling's link to the parent.
function pathOf(r) {
  const cs = compoundsOf(r.selector);
  const isSibling = (comb) => comb === '+' || comb === '~';
  const path = [];
  let inherited = null;
  cs.forEach((c, i) => {
    const link = isSibling(c.combinator) ? inherited : c.combinator;
    if (isSibling(cs[i + 1]?.combinator)) { inherited = link; return; }
    path.push({ ...elementOf(c), gapAbove: link !== '>' });
  });
  return [...contextOf(r), ...path];
}

// Whether Keepia alternative `alt` targets the element of VitePress rule `r`: its subject
// compound has every class of r's subject compound, and it matches the elements r's
// selector describes, ancestors included (same type, attributes and pseudo-element for
// the subject; every ancestor compound of `alt` found above it, a child combinator only
// where r has one).
function covers(alt, r) {
  const theirs = subjectCompound(r.selector);
  const ours = subjectCompound(alt);
  const path = pathOf(r);
  return theirs.classes.every((c) => ours.classes.includes(c)) && selectorMatchesPath(alt, path);
}

// Whether Keepia declaration `d` on alternative `alt` beats VitePress rule `r`.
function beats(alt, d, r) {
  if (r.layer) return !r.important; // unlayered beats layered normal declarations
  if (r.important) return d.important && compareSpecificity(specificity(alt), r.specificity) > 0;
  return d.important || compareSpecificity(specificity(alt), r.specificity) > 0;
}

const KEPT_KEYS = new Set(KEPT.map((k) => key(k.file, k.selector, k.property)));
const KEPT_WITH_ELEMENT = new Set(KEPT.filter((k) => k.element).map((k) => key(k.file, k.selector, k.property)));
const declProps = (decls) => decls.map((d) => d.slice(0, d.indexOf(':')).trim());
const coverEntries = [
  ...CORNERS.map((c) => ({ ...c, properties: ['border-radius'] })),
  ...RULES.filter((r) => r.covers).map((r) => ({ ...r, selectors: splitTopLevel(r.selector, ','), properties: declProps(r.decls) })),
];
// The fixture rules an entry overrides: those of its covered selectors that set a
// property the entry sets.
const coveredRules = (e) => e.covers.flatMap((c) => fixtureRules(c.file, c.selector).filter((r) => e.properties.some((p) => overridesProp(p, r.property)) && needsClassification(r)));
const COVERED_KEYS = new Set(coverEntries.flatMap((e) => coveredRules(e).map((r) => key(r.file, r.selector, r.property))));

// ---------------------------------------------------------------- structure

// A minified VitePress build drops this comment (see LEGAL_COMMENT); the notice inside
// each icon (see the icon notice test) reaches the built docs.
test('vitepress.css starts with the Apache-2.0 notice of the Carbon icons as a legal comment', () => {
  const css = read(CSS_PATH);
  assert.ok(css.startsWith(`${LEGAL_COMMENT}\n`), 'the legal comment comes first (Lightning CSS keeps only a leading one)');
  assert.match(LEGAL_COMMENT, /^\/\*![\s\S]*Carbon[\s\S]*IBM Corp\.[\s\S]*Apache-2\.0[\s\S]*\*\/$/);
  assert.equal(css.match(/\/\*!/g).length, 1, 'one legal comment');
});

test('vitepress.css is flat: only @font-face at-rules, at the top level', () => {
  for (const a of parsed.atRules) {
    assert.equal(a.name, 'font-face', `unexpected @${a.name} at line ${a.line}`);
    assert.equal(a.depth, 0);
  }
  for (const r of parsed.rules) {
    assert.deepEqual(r.parents, [], `nested rule ${r.selector}`);
    assert.equal(r.media ?? r.layer ?? r.supports, null, `${r.selector} sits in an at-rule`);
  }
});

const docsearchBlocks = () => ({ light: variableBlock(DOCSEARCH_SELECTORS.light), dark: variableBlock(DOCSEARCH_SELECTORS.dark) });

test('vitepress.css: exactly the :root and .dark blocks, the two DocSearch blocks and the scoped DocSearch blocks set custom properties, each pair the same set', () => {
  const { light, dark } = blocks();
  const setters = parsed.rules.filter((r) => r.decls.some(isCustom)).map((r) => r.selector);
  assert.deepEqual(setters, [':root', '.dark', ':root:root:root', ':root:root:root.dark', '.DocSearch-Hit[aria-selected=true]', '.DocSearch-Sidepanel-RecentConversation']);
  assert.equal(DOCSEARCH_SCOPED[0], DOCSEARCH_SELECTED_HIT);
  for (const s of DOCSEARCH_SCOPED) {
    assert.deepEqual(Object.fromEntries(variableBlock(s.selector)), s.vars);
    // text-primary in both themes: see the colour test.
    for (const v of Object.values(s.vars)) assert.equal(v, 'var(--vp-c-text-1)');
  }
  assert.deepEqual(DOCSEARCH_SELECTORS, { light: ':root:root:root', dark: ':root:root:root.dark' });
  assert.deepEqual([...dark.keys()].sort(), [...light.keys()].sort());
  const icons = Object.keys(BLOCK_ICONS).map((kind) => `--keepia-vp-icon-${kind}`);
  assert.deepEqual([...light.keys()].sort(), [...Object.keys(MAP), ...Object.keys(staticProperties(families)), ...icons].sort());
  const ds = docsearchBlocks();
  assert.deepEqual([...ds.light.keys()], Object.keys(DOCSEARCH_MAP));
  assert.deepEqual([...ds.dark.keys()], Object.keys(DOCSEARCH_MAP));
});

test('vitepress.css: its own variables are --keepia-vp-*, the others --vp-* or, in the DocSearch blocks, --docsearch-* variables DocSearch defines', () => {
  const css = read(CSS_PATH);
  assert.ok(!/pklnx/i.test(css), 'no pklnx name is left');
  for (const name of blocks().light.keys()) assert.match(name, /^--(vp|keepia-vp)-[a-z0-9-]+$/, name);
  for (const m of css.matchAll(/var\((--[\w-]+)\)/g)) assert.match(m[1], /^--(vp|keepia-vp)-/, m[1]);
  const defined = new Set(fixture.customProperties.filter((d) => d.file.startsWith('@docsearch/css/') || d.file === 'styles/docsearch.css').map((d) => d.property));
  for (const name of [...docsearchBlocks().light.keys(), ...DOCSEARCH_SCOPED.flatMap((s) => Object.keys(s.vars))]) {
    assert.match(name, /^--docsearch-[a-z-]+$/, name);
    assert.ok(defined.has(name), `${name} is not a DocSearch variable`);
  }
});

test('vitepress.css: the DocSearch blocks out-rank every DocSearch definition of their variables, the dark one the light one', () => {
  // styles/docsearch.css loads after this file (async VPAlgoliaSearchBox), so a tie is not enough.
  const light = specificity(DOCSEARCH_SELECTORS.light);
  const dark = specificity(DOCSEARCH_SELECTORS.dark);
  assert.ok(compareSpecificity(dark, light) > 0);
  const theirs = fixture.customProperties.filter((d) => d.property in DOCSEARCH_MAP);
  assert.ok(theirs.some((d) => d.file === 'styles/docsearch.css' && d.selector === ':root:root'), "VitePress's :root:root definitions are captured");
  for (const d of theirs) assert.ok(compareSpecificity(light, d.specificity) > 0, `${d.file} ${d.selector} ${formatSpecificity(d.specificity)} ties or beats ${DOCSEARCH_SELECTORS.light}`);
});

test('vitepress.css: every colour equals tokens.json for its mapped token', () => {
  const b = blocks();
  const ds = docsearchBlocks();
  for (const theme of ['light', 'dark']) {
    for (const [name, t] of Object.entries(DOCSEARCH_MAP)) assert.equal(ds[theme].get(name), tokens[theme][t[theme]], `${theme} ${name} (${t[theme]})`);
    // keepia/mail#37: the selected hit is highlight (brand-soft), its brand-1 text text-primary.
    assert.equal(DOCSEARCH_MAP['--docsearch-hit-highlight-color'][theme], 'highlight');
    assert.equal(MAP['--vp-c-brand-soft'][theme], 'highlight');
    assert.equal(MAP['--vp-c-text-1'][theme], 'text-primary');
    for (const [name, t] of Object.entries(MAP)) {
      let want = t[theme] === 'transparent' ? 'transparent' : tokens[theme][t[theme]];
      assert.ok(want, `${theme}: token ${t[theme]} missing in tokens.json`);
      if (t.alpha !== undefined) want = rgba(want, t.alpha);
      assert.equal(b[theme].get(name), want, `${theme} ${name} (${t[theme]})`);
    }
  }
});

test('vitepress.css: pinned values', () => {
  const { light, dark } = blocks();
  // The brand step for step: Carbon's interactive Blue 60 / 40 become the primary hue's 60 / 40
  // (scripts/build.mjs), whatever hue theme/brand.json names. The value is taken from @carbon/colors,
  // the mapping from the tokens vitepress-map.mjs names, so a wrong step or a wrong token fails here.
  const step = (n) => requireFromRoot('@carbon/colors')[`${brandPrimary}${n}`].toLowerCase();
  assert.equal(brandPrimary, 'teal');
  assert.deepEqual(MAP['--vp-c-brand-1'], { light: 'link-primary', dark: 'link-primary' }, 'brand-1 follows link-primary');
  assert.deepEqual(MAP['--vp-c-brand-2'], { light: 'link-primary-hover', dark: 'link-primary-hover' }, 'brand-2 follows link-primary-hover');
  assert.deepEqual(MAP['--vp-c-brand-3'], { light: 'button-primary', dark: 'button-primary' }, 'brand-3 follows button-primary');
  assert.deepEqual(MAP['--vp-c-brand-soft'], { light: 'highlight', dark: 'highlight' }, 'brand-soft follows highlight');
  assert.equal(light.get('--vp-c-brand-1'), step(60));
  assert.equal(light.get('--vp-c-brand-1'), '#007d79');
  assert.equal(tokens.light['link-primary'], step(60));
  assert.equal(dark.get('--vp-c-brand-1'), step(40));
  assert.equal(dark.get('--vp-c-brand-1'), '#08bdba');
  assert.equal(tokens.dark['link-primary'], step(40));
  assert.equal(light.get('--vp-c-brand-soft'), step(20));
  assert.equal(dark.get('--vp-c-brand-soft'), step(90));
  assert.equal(dark.get('--vp-button-brand-bg'), step(60));
  assert.equal(tokens.dark['button-primary'], step(60));
  assert.equal(light.get('--vp-c-bg'), '#ffffff');
  assert.equal(dark.get('--vp-c-bg'), '#161616');
  assert.equal(light.get('--vp-local-search-highlight-text'), '#161616');
  assert.equal(dark.get('--vp-local-search-highlight-text'), '#f4f4f4');
  for (const b of [light, dark]) {
    assert.match(b.get('--vp-font-family-base'), /^"IBM Plex Sans", /);
    assert.match(b.get('--vp-font-family-mono'), /^"IBM Plex Mono", /);
    assert.equal(b.get('--vp-font-family-base'), families.sans);
    assert.equal(b.get('--vp-font-family-mono'), families.mono);
    assert.equal(b.get('--vp-home-hero-image-background-image'), 'none');
  }
});

test(`every --vp-* variable it sets exists in VitePress ${VITEPRESS_VERSION}`, () => {
  const known = new Set(Object.values(fixture.vars).flat());
  for (const name of blocks().light.keys()) {
    if (name.startsWith('--keepia-')) continue;
    assert.ok(known.has(name), `${name} is not a VitePress variable`);
  }
});

// ---------------------------------------------------------------- contrast

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a 6-digit hex colour: ${hex}`);
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('contrast: every pair VitePress renders with the mapped variables, in both themes', () => {
  const b = blocks();
  const failing = [];
  let n = 0;
  for (const theme of ['light', 'dark']) {
    const v = (name) => { const x = b[theme].get(name); assert.ok(x, `${name} is not set in vitepress.css`); return x; };
    for (const p of PAIRS) for (const ground of p.on) {
      n++;
      const r = ratio(v(p.fg), v(ground));
      if (!(r >= p.min)) failing.push(`${theme} ${p.fg} on ${ground}: ${r.toFixed(2)} < ${p.min} (${p.where})`);
    }
  }
  assert.equal(n, 232, 'pklnx\'s PAIRS: 116 grounds per theme');
  assert.deepEqual(failing, []);
});

// The plan keeps pklnx's PAIRS, its double ring and its token map unchanged: the same JSON as
// pklnx/design-system 13e5f8b scripts/vitepress-map.mjs, with --pklnx-vp- for --keepia-vp-.
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const asPklnx = (o) => JSON.stringify(o).replaceAll('--keepia-vp-', '--pklnx-vp-');
test("PAIRS, the double ring and MAP are pklnx's, unchanged apart from the prefix", () => {
  assert.equal(sha256(asPklnx(PAIRS)), 'f29de7479ac52b8d6abe1964da3faf09fd444cc873281536094eae856593c886', 'PAIRS');
  assert.equal(sha256(asPklnx(MAP)), '2304c74e84bd7cd309e7e0a75badee6dafa59b49ea355a3755bd75d2e57e74a4', 'MAP');
  assert.deepEqual(RING_GROUNDS, ['--vp-button-brand-bg', '--vp-button-brand-hover-bg', '--vp-button-brand-active-bg', '--vp-button-alt-bg', '--vp-button-alt-hover-bg', '--vp-button-alt-active-bg']);
  assert.deepEqual(RINGS, ['--keepia-vp-focus', '--keepia-vp-focus-inset']);
  // Spelled out for the pairs the plan names: links and link hover at 4.5 on the page grounds.
  const brand1 = PAIRS.find((p) => p.fg === '--vp-c-brand-1');
  assert.deepEqual(brand1, { fg: '--vp-c-brand-1', on: ['--vp-c-bg', '--vp-c-bg-alt', '--vp-c-bg-soft', '--vp-c-bg-elv', '--vp-c-default-soft', '--vp-sidebar-bg-color', '--vp-local-search-result-bg'], min: 4.5, where: 'links, active nav and menu link' });
  assert.deepEqual(PAIRS.find((p) => p.fg === '--vp-c-brand-2'), { fg: '--vp-c-brand-2', on: ['--vp-c-bg', '--vp-c-bg-alt', '--vp-c-bg-soft'], min: 4.5, where: 'link hover' });
  for (const p of PAIRS) assert.ok([4.5, 3, 1.05].includes(p.min), `${p.where}: min ${p.min}`);
});

test("contrast: Carbon's double focus ring reaches 3:1 on every button state", () => {
  const b = blocks();
  for (const theme of ['light', 'dark']) for (const g of RING_GROUNDS) {
    const best = Math.max(...RINGS.map((ring) => ratio(b[theme].get(ring), b[theme].get(g))));
    assert.ok(best >= 3, `${theme} ${g}: best ring ${best.toFixed(2)}`);
  }
});

// ---------------------------------------------------------------- brand-soft guard
// White brand-1 on brand-soft (Teal 60 on Teal 20) is 3.84:1, below 4.5. PAIRS does not list
// it because no rule renders brand-1 text on a brand-soft ground; this guard keeps it so.
//
// It resolves every colour and background declaration of the captured stylesheets (fixture
// colorRules: VitePress's theme and the @docsearch/css files styles/docsearch.css @imports)
// and of vitepress.css through the custom properties of all of them (fixture
// customProperties plus vitepress.css's blocks), with the cascade: per theme, at the root
// element the most specific and then the latest declaration wins (VitePress's sync
// stylesheets, then vitepress.css, then the async ones: VPAlgoliaSearchBox's docsearch.css
// with @docsearch/css, VPLocalSearchBox, VPCarbonAds). A root declaration under a condition
// (an attribute, :where(), @media) and every declaration on another element count as
// further possible values. Colour literals (#rgb, #rrggbb, rgb(), rgba()) are compared
// normalised, and a multi-part `background` counts with each of its parts. Where the text
// meets the ground, its colour resolves in their context: a declaration on one plain
// compound (no pseudo-class, no @media) that the text's or ground's selector names as the
// element or an ancestor (its ancestry: compounds before a `+` or `~` do not count) is
// inherited instead of the root's values (vitepress.css's DOCSEARCH_SCOPED blocks,
// keepia/mail#37). The var()s inside a root declaration resolve on the root, without the
// context, as the browser computes them there. The var()s inside a declaration that applies
// in the context resolve with it, but there a declaration on another compound of the
// context only adds a possible value and keeps the root's (the context may name elements
// below the declaring one; keepia/mail#35).
//
// It fails where a rule paints a colour of --vp-c-brand-1 on, inside, below or next to (a
// shared ancestor) an element whose background can be the colour of --vp-c-brand-soft, and
// where a colour value does not resolve (UNRESOLVED_OK lists the exceptions with reasons).
// Page rules that name an ancestor outside DocSearch's classes do not reach the DocSearch
// modal, which is a portal on <body> (PORTAL_GROUND).
//
// It does not see: inheritance through elements no selector names (a parent component
// passing brand-1 into a child component's scoped ground, an ancestor the ground's selector
// does not name); colours inside functions (gradients, color-mix()); colours set by scripts
// or inline styles; @docsearch/css's own corner, outline and font rules (the products use
// the local search, pklnx's KEPT list covers styles/docsearch.css).

const VAR = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^]+))?\)$/;
// A colour literal as '#rrggbb' when opaque, else 'rgba(r, g, b, a)'; other values lower-cased.
function normColour(value) {
  const s = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return s;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = h.length === 8 ? Math.round((parseInt(h.slice(6), 16) / 255) * 1000) / 1000 : 1;
    return a === 1 ? `#${h.slice(0, 6)}` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    const [r, g, b] = rgb.slice(1, 4).map(Number);
    return a === 1 ? `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return s;
}

// Where a custom-property declaration applies in `theme`: 'root' (the root element, no
// condition), 'conditional' (the root element under an attribute, a pseudo-class other than
// :root, or @media), 'local' (another element) or 'off' (the other theme's root).
const THEME_CLASSES = { light: [], dark: ['dark'] };
function scopeOf(d, theme) {
  const cs = compoundsOf(d.selector);
  const c = cs[0];
  if (cs.length !== 1 || (c.type && c.type !== 'html') || c.ids.length || c.pseudoElement) return 'local';
  if (!c.classes.every((k) => k === 'dark')) return 'local';
  if (!c.type && !c.classes.length && !c.attrs.length && !c.pseudos.length) return 'local';
  if (!c.classes.every((k) => THEME_CLASSES[theme].includes(k))) return 'off';
  return d.media || c.attrs.length || c.pseudos.some((p) => p.name !== 'root') ? 'conditional' : 'root';
}

// vitepress.css's custom properties, as the fixture records VitePress's.
const keepiaCustomProperties = () => parsed.rules.filter((r) => r.decls.some(isCustom)).flatMap((r) => splitTopLevel(r.selector, ',')
  .flatMap((selector) => r.decls.filter(isCustom).map((d) => ({ file: CSS_PATH, selector, property: d.prop, value: d.value, media: r.media, specificity: specificity(selector), async: false }))));

// Whether custom-property declaration `d` surely applies to an element, or one of its
// ancestors, that a compound of `context` describes: `d` is one compound without
// pseudo-classes, pseudo-elements or @media, and that compound has every part of it.
function appliesIn(d, context) {
  const cs = compoundsOf(d.selector);
  if (cs.length !== 1 || d.media || cs[0].pseudos.length || cs[0].pseudoElement || !named(cs[0])) return false;
  return context.some((c) => within(c, cs[0]));
}

// (value, context) → the colours it can resolve to in `theme` (null for a variable that does
// not resolve). `context` is a list of compounds (compoundsOf) that describe the element or
// its ancestors: where a declaration on one of them surely applies, it is inherited instead
// of the root's value, so the root declarations drop out (not inside the value of such a
// declaration, see candidates); other declarations on elements
// stay possible values. `without(declaration)` leaves declarations out, for the red cases.
function resolverFor(theme, { without = () => false, base = fixture.customProperties } = {}) {
  const decls = [...base.filter((d) => !d.async), ...keepiaCustomProperties(), ...base.filter((d) => d.async)].filter((d) => !without(d));
  const byName = new Map();
  decls.forEach((d, order) => {
    if (!byName.has(d.property)) byName.set(d.property, []);
    byName.get(d.property).push({ ...d, order, scope: scopeOf(d, theme) });
  });
  const later = (a, b) => compareSpecificity(a.specificity, b.specificity) || (a.order - b.order);
  // Each candidate with the context its own var()s resolve in. A custom property computes
  // its var()s on the element that declares it, and descendants inherit the result: so
  // only a declaration that surely applies in `context` passes the context on; a root,
  // conditional or other element's declaration resolves its var()s without it.
  // The context passed on still names the elements below the declaring one (the text's
  // own compounds), whose declarations the browser does not see there: `.hit { --a:
  // var(--x) }` takes `--x` on `.hit`, not on a `mark` inside it (keepia/mail#35, comment
  // 6817584702). So inside a value passed on (`inner`), a local declaration in the context
  // only adds a possible value and never drops the root's.
  const candidates = (name, context, inner) => {
    const ds = byName.get(name) ?? [];
    const local = ds.filter((d) => d.scope === 'local');
    const passed = (d) => (appliesIn(d, context) ? context : []);
    if (!inner && local.some((d) => appliesIn(d, context))) return local.map((d) => ({ value: d.value, context: passed(d) }));
    const root = ds.filter((d) => d.scope === 'root').sort(later).at(-1);
    return [...(root ? [root] : []), ...ds.filter((d) => d.scope === 'local' || (d.scope === 'conditional' && (!root || later(d, root) > 0)))]
      .map((d) => ({ value: d.value, context: d.scope === 'local' ? passed(d) : [] }));
  };
  const resolve = (value, context, seen, inner) => {
    const v = value.trim();
    const parts = splitTopLevel(v, ',').flatMap((p) => splitTopLevel(p, ' '));
    if (parts.length > 1) return [...new Set(parts.flatMap((p) => resolve(p, context, seen, inner)))];
    const m = VAR.exec(v);
    if (!m) return [normColour(v)];
    if (seen.includes(m[1])) return [null];
    const values = candidates(m[1], context, inner);
    if (!values.length) return m[2] === undefined ? [null] : resolve(m[2], context, seen, inner);
    return [...new Set(values.flatMap((x) => resolve(x.value, x.context, [...seen, m[1]], x.context.length > 0)))];
  };
  return (value, context = []) => resolve(value, context, [], false);
}

// The compounds of `selector` that describe its subject or the subject's ancestors: the
// list cut at the last `+` or `~` (a compound before a sibling combinator is a sibling,
// whose custom properties the subject does not inherit; cutting there errs towards a
// finding).
function ancestry(selector) {
  const cs = compoundsOf(selector);
  const cut = cs.findLastIndex((c) => c.combinator === '+' || c.combinator === '~');
  return cut < 0 ? cs : cs.slice(cut);
}

// Whether compound `inner` names the same element as `outer` or a less specific description
// of it: every type, id, class and attribute of inner is in outer. Pseudo-classes and
// pseudo-elements are ignored, so states that never meet still count (the guard errs
// towards a finding).
const within = (outer, inner) => (inner.type === null || inner.type === outer.type)
  && inner.ids.every((i) => outer.ids.includes(i))
  && inner.classes.every((c) => outer.classes.includes(c))
  && inner.attrs.every((a) => outer.attrs.some((b) => b.name === a.name && b.op === a.op && b.value === a.value));
const named = (c) => Boolean(c.type || c.ids.length || c.classes.length || c.attrs.length);
const INHERITS = ['inherit', 'currentcolor', 'unset', 'revert'];
const BG = ['background', 'background-color'];

// rules: [{ file, selector, property, value, scoped }]; resolve: value → colours. Returns one
// line per brand-1 text rule that lands on a brand-soft ground:
//   - on it or inside it: the ground's subject is one of the text selector's compounds;
//   - above it, when the ground sets no colour of its own (`inherit` and the like do not
//     count): the text's subject is an ancestor compound of the ground's selector;
//   - next to it: both selectors share a named ancestor compound (the text may sit inside the
//     ground, as a <mark> in a selected hit's <a>).
// Scoped rules of two different components never meet, and neither do the two search
// providers: a site sets one `themeConfig.search.provider`, so VitePress renders either the
// local search or Algolia's DocSearch.
const PROVIDERS = [
  (file) => file === 'components/VPLocalSearchBox.vue',
  (file) => file === 'components/VPAlgoliaSearchBox.vue' || file === 'styles/docsearch.css' || file.startsWith('@docsearch/css/'),
];
const otherProviders = (a, b) => PROVIDERS.some((p, i) => p(a) && PROVIDERS.some((q, j) => j !== i && q(b)));
// DocSearch renders its modal (the grounds of @docsearch/css's style.css) in a portal on
// <body>: `portalContainer ?? document.body` in @docsearch/js 4.7.0, and VitePress sets no
// portalContainer. So a rule that names an ancestor other than html, body, .dark or a
// DocSearch-* class (.vp-doc a, .custom-block a) never reaches it.
// The search button (.DocSearch-Button*) is in the nav bar, not in the portal.
const PORTAL_GROUND = (g) => g.file === '@docsearch/css/dist/style.css'
  && !compoundsOf(g.selector).some((c) => c.classes.some((k) => k.startsWith('DocSearch-Button')));
const outsidePortal = (compounds) => compounds.slice(0, -1).filter(named)
  .some((c) => c.ids.length || (c.type && !['html', 'body'].includes(c.type)) || c.classes.some((k) => k !== 'dark' && !k.startsWith('DocSearch-')));
function brandSoftFindings(rules, resolve, brand1, soft) {
  const has = (r, colour) => resolve(r.value).includes(normColour(colour));
  const grounds = rules.filter((r) => BG.includes(r.property) && has(r, soft));
  const texts = rules.filter((r) => r.property === 'color' && has(r, brand1));
  const findings = [];
  for (const g of grounds) {
    const gCompounds = compoundsOf(g.selector);
    const gSubject = gCompounds.at(-1);
    const gAncestors = gCompounds.slice(0, -1).filter(named);
    const ownColour = rules.some((r) => r.property === 'color' && r.file === g.file && r.selector === g.selector && resolve(r.value).some((v) => !INHERITS.includes(v)));
    for (const t of texts) {
      if ((g.scoped && t.scoped && g.file !== t.file) || otherProviders(g.file, t.file)) continue;
      const tCompounds = compoundsOf(t.selector);
      if (PORTAL_GROUND(g) && outsidePortal(tCompounds)) continue;
      const inside = tCompounds.some((c) => within(c, gSubject));
      const above = !ownColour && gCompounds.slice(0, -1).some((c) => within(c, tCompounds.at(-1)));
      const nextTo = gAncestors.some((gc) => tCompounds.slice(0, -1).filter(named).some((tc) => within(tc, gc) || within(gc, tc)));
      // The text's colour where it meets the ground: on or inside it, the text's element sits
      // in the ground's element (the ground's ancestry describes it or an ancestor); next to
      // it, under the ground's ancestors; above it, the text's own colour inherits down. Only
      // the ancestry counts (see ancestry): siblings pass nothing on.
      const tAncestry = ancestry(t.selector);
      const gAncestry = ancestry(g.selector);
      const brandAt = (context) => resolve(t.value, context).includes(normColour(brand1));
      const meets = (inside && brandAt([...tAncestry, ...gAncestry]))
        || (nextTo && brandAt([...tAncestry, ...gAncestry.slice(0, -1)]))
        || (above && brandAt(tAncestry));
      if (meets) findings.push(`${t.file} ${t.selector} { color: ${t.value} } on ${g.file} ${g.selector} { ${g.property}: ${g.value} }`);
    }
  }
  return findings;
}

const keepiaColourRules = () => parsed.rules.filter((r) => !r.decls.some(isCustom)).flatMap((r) => r.decls
  .filter((d) => COLOR_PROPERTIES.includes(d.prop))
  .flatMap((d) => splitTopLevel(r.selector, ',').map((selector) => ({ file: CSS_PATH, selector, property: d.prop, value: d.value, scoped: false }))));
const guardRules = () => [...fixture.colorRules, ...keepiaColourRules()];

// Colour values that do not resolve to anything, with the reason they may stay.
const UNRESOLVED_OK = {};

test('contrast: White brand-1 on brand-soft is 3.84:1, which is why no rule may render it', () => {
  const { light, dark } = blocks();
  assert.equal(ratio(light.get('--vp-c-brand-1'), light.get('--vp-c-brand-soft')).toFixed(2), '3.84');
  assert.ok(ratio(dark.get('--vp-c-brand-1'), dark.get('--vp-c-brand-soft')) >= 4.5, 'G100 passes, the guard checks both themes anyway');
  for (const p of PAIRS) assert.ok(!(p.fg === '--vp-c-brand-1' && p.on.includes('--vp-c-brand-soft')), 'the pair is guarded, not listed');
});

test('the fixture holds the colour declarations and custom properties of VitePress and of @docsearch/css ' + DOCSEARCH_CSS_VERSION, () => {
  assert.deepEqual(COLOR_PROPERTIES, ['color', 'background', 'background-color']);
  assert.deepEqual(fixture.colorProperties, COLOR_PROPERTIES, 'the fixture was captured with the capture script\'s colour properties');
  assert.deepEqual(fixture.docsearch, { version: DOCSEARCH_CSS_VERSION, files: ['@docsearch/css/dist/style.css', '@docsearch/css/dist/sidepanel.css'] });
  // The lowest version VitePress's caret range allows (Review B N1, keepia/design-system#6).
  assert.equal(DOCSEARCH_CSS_RANGE, '^4.7.0');
  assert.equal(`^${DOCSEARCH_CSS_VERSION}`, DOCSEARCH_CSS_RANGE, 'the fixture holds the lowest version of the range');
  for (const file of ['styles/vars.css', 'styles/docsearch.css', ...fixture.docsearch.files]) {
    assert.ok(fixture.customProperties.some((d) => d.file === file), `no custom property from ${file}`);
    assert.ok(fixture.colorRules.some((r) => r.file === file) || file === 'styles/vars.css', `no colour rule from ${file}`);
  }
  for (const p of COLOR_PROPERTIES) assert.ok(fixture.colorRules.some((r) => r.property === p), `no ${p} rule captured`);
  // styles/docsearch.css (and so @docsearch/css) loads with the async VPAlgoliaSearchBox.
  for (const d of fixture.customProperties.filter((x) => x.file === 'styles/docsearch.css' || x.file.startsWith('@docsearch/'))) assert.equal(d.async, true, `${d.file} ${d.selector}`);
  assert.equal(fixture.customProperties.find((d) => d.file === 'styles/vars.css').async, false);
});

test("brand-soft guard: the resolver follows the cascade, VitePress's vars.css included", () => {
  const b = blocks();
  for (const theme of ['light', 'dark']) {
    const resolve = resolverFor(theme);
    const brand1 = b[theme].get('--vp-c-brand-1');
    // --vp-c-brand (deprecated) is not mapped: only vars.css's :root gives it, as var(--vp-c-brand-1).
    assert.ok(!MAP['--vp-c-brand']);
    assert.deepEqual(resolve('var(--vp-c-brand)'), [brand1], `${theme}: --vp-c-brand through vars.css`);
    // --docsearch-primary-color: @docsearch/css's :root (0,1,0) loses to styles/docsearch.css's :root:root (0,2,0).
    assert.deepEqual(resolve('var(--docsearch-primary-color)'), [brand1], `${theme}: DocSearch's primary colour`);
    // A fallback, a cycle and a missing variable.
    assert.deepEqual(resolve('var(--nope, #FFF)'), ['#ffffff']);
    assert.deepEqual(resolve('var(--nope)'), [null]);
  }
  // vitepress.css's .dark block is off in light, VitePress's .dark values too.
  assert.deepEqual(resolverFor('light')('var(--vp-c-bg)'), ['#ffffff']);
  assert.deepEqual(resolverFor('dark')('var(--vp-c-bg)'), ['#161616']);
  // Literals: hex, short hex, rgb(), rgba(), and the parts of a background shorthand.
  const resolve = resolverFor('light');
  assert.deepEqual(resolve('#9EF0F0'), ['#9ef0f0']);
  assert.deepEqual(resolve('#9ef'), ['#99eeff']);
  assert.deepEqual(resolve('rgb(158, 240, 240)'), ['#9ef0f0']);
  assert.deepEqual(resolve('rgb(158 240 240 / 50%)'), ['rgba(158, 240, 240, 0.5)']);
  assert.deepEqual(resolve('var(--vp-c-brand-soft) no-repeat'), ['#9ef0f0', 'no-repeat']);
  assert.deepEqual(resolve('url(x.png), var(--vp-c-brand-soft)'), ['url(x.png)', '#9ef0f0']);
});

test('brand-soft guard: every colour value of the captured stylesheets and of vitepress.css resolves', () => {
  const failing = [];
  for (const theme of ['light', 'dark']) {
    const resolve = resolverFor(theme);
    for (const r of guardRules()) {
      if (!resolve(r.value).includes(null)) continue;
      const k = `${r.file} ${r.selector} { ${r.property}: ${r.value} }`;
      if (!UNRESOLVED_OK[k]) failing.push(`${theme} ${k}`);
    }
  }
  assert.deepEqual([...new Set(failing)], []);
  for (const [k, reason] of Object.entries(UNRESOLVED_OK)) assert.ok(reason, k);
});

test('brand-soft guard: no captured or Keepia rule paints --vp-c-brand-1 text on --vp-c-brand-soft, in both themes', () => {
  assert.ok(fixture.colorRules.length >= 500, `only ${fixture.colorRules.length} colour rules in the fixture`);
  const b = blocks();
  const rules = guardRules();
  for (const theme of ['light', 'dark']) {
    const resolve = resolverFor(theme);
    const brand1 = b[theme].get('--vp-c-brand-1');
    const soft = b[theme].get('--vp-c-brand-soft');
    // The guard must see the rules it is about: brand-1 text (links, the menu link) and a
    // brand-soft ground (the local search's match, whose text is text-primary).
    assert.ok(rules.some((r) => r.property === 'color' && resolve(r.value).includes(brand1)), `${theme}: no brand-1 text rule resolved`);
    assert.ok(rules.some((r) => BG.includes(r.property) && resolve(r.value).includes(soft)), `${theme}: no brand-soft ground resolved: the guard checks nothing`);
    assert.deepEqual(brandSoftFindings(rules, resolve, brand1, soft), [], theme);
  }
});

test("brand-soft guard: without vitepress.css's DocSearch blocks it finds the three DocSearch rules", () => {
  const b = blocks();
  const resolve = resolverFor('light', { without: (d) => d.file === CSS_PATH && [...Object.values(DOCSEARCH_SELECTORS), ...DOCSEARCH_SCOPED.map((s) => s.selector)].includes(d.selector) });
  const found = brandSoftFindings(guardRules(), resolve, b.light.get('--vp-c-brand-1'), b.light.get('--vp-c-brand-soft'));
  const want = [
    'styles/docsearch.css .DocSearch-Sidepanel-Prompt--submit { color: var(--docsearch-primary-color) } on styles/docsearch.css .DocSearch-Sidepanel-Prompt--submit { background-color: var(--docsearch-soft-primary-color) }',
    '@docsearch/css/dist/style.css .DocSearch-Hit[aria-selected=true] mark { color: var(--docsearch-highlight-color) } on @docsearch/css/dist/style.css .DocSearch-Hit[aria-selected=true] a { background-color: var(--docsearch-hit-highlight-color) }',
    '@docsearch/css/dist/style.css .DocSearch-Action:hover { color: var(--docsearch-highlight-color) } on @docsearch/css/dist/style.css .DocSearch-Action:hover { background: var(--docsearch-soft-primary-color) }',
    '@docsearch/css/dist/sidepanel.css .DocSearch-Sidepanel-RecentConversation:hover .DocSearch-Hit-action { color: var(--docsearch-sidepanel-accent) } on @docsearch/css/dist/sidepanel.css .DocSearch-Sidepanel-RecentConversation:hover { background-color: var(--docsearch-hit-highlight-color) }',
  ];
  for (const w of want) assert.ok(found.includes(w), `not found: ${w}`);
});

test('brand-soft guard: the resolver takes the scoped DocSearch blocks where its selector describes the element or an ancestor', () => {
  const b = blocks();
  const selected = compoundsOf('.DocSearch-Hit[aria-selected=true] mark');
  for (const theme of ['light', 'dark']) {
    const resolve = resolverFor(theme);
    const brand1 = b[theme].get('--vp-c-brand-1');
    const text1 = b[theme].get('--vp-c-text-1');
    assert.deepEqual(resolve('var(--docsearch-highlight-color)', selected), [text1], `${theme}: inside the selected hit`);
    assert.deepEqual(resolve('var(--docsearch-highlight-color)', compoundsOf('.DocSearch-Hit mark')), [brand1, text1], `${theme}: a hit that may or may not be selected`);
    assert.deepEqual(resolve('var(--docsearch-highlight-color)', compoundsOf('.DocSearch-Hit:hover[aria-selected=true] mark')), [text1], `${theme}: a pseudo-class on the context`);
    // Every other definition of the scoped variables is on the root element, so the blocks
    // win by inheritance.
    for (const s of DOCSEARCH_SCOPED) {
      for (const d of fixture.customProperties.filter((x) => x.property in s.vars)) assert.notEqual(scopeOf(d, theme), 'local', `${d.file} ${d.selector}`);
    }
    const hovered = compoundsOf('.DocSearch-Sidepanel-RecentConversation:hover .DocSearch-Hit-action');
    assert.deepEqual(resolve('var(--docsearch-sidepanel-accent)', hovered), [text1], `${theme}: a hovered recent conversation`);
    assert.deepEqual(resolve('var(--docsearch-sidepanel-accent)'), [brand1, text1], `${theme}: the sidepanel accent elsewhere`);
  }
  // A declaration under a pseudo-class or @media, or on more than one compound, is only possible.
  const base = [{ file: 'x.css', selector: ':root', property: '--x', value: '#000000', media: null, specificity: [0, 1, 0], async: false }];
  const at = (selector, extra = {}) => resolverFor('light', { base: [...base, { file: 'x.css', selector, property: '--x', value: '#ffffff', media: null, specificity: specificity(selector), async: false, ...extra }] })('var(--x)', compoundsOf('.a .b'));
  assert.deepEqual(at('.a'), ['#ffffff']);
  assert.deepEqual(at('.a:hover'), ['#000000', '#ffffff']);
  assert.deepEqual(at('.a', { media: '(min-width: 1px)' }), ['#000000', '#ffffff']);
  assert.deepEqual(at('.c .a'), ['#000000', '#ffffff']);
  assert.deepEqual(at('.c'), ['#000000', '#ffffff']);
});

test('contrast: the DocSearch text pairs reach 4.5:1 in both themes, through every captured stylesheet', () => {
  const failing = [];
  const captured = (file, selector) => fixture.colorRules.filter((r) => r.file === file && r.selector === selector);
  for (const p of DOCSEARCH_PAIRS) {
    for (const [file, selector] of p.rules) assert.ok(captured(file, selector).some((r) => r.property === 'color'), `${file} ${selector} is not a captured colour rule`);
    if (p.ground) assert.ok(captured(...p.ground).some((r) => BG.includes(r.property) && r.value.includes(`var(${p.on})`)), `${p.ground.join(' ')} does not paint ${p.on}`);
    for (const theme of ['light', 'dark']) {
      const resolve = resolverFor(theme);
      // The text sits inside the ground: both selectors describe its element or its ancestors.
      const groundContext = p.ground ? ancestry(p.ground[1]) : [];
      const fgs = [...new Set(p.rules.flatMap(([, selector]) => resolve(`var(${p.fg})`, [...ancestry(selector), ...groundContext])))];
      const grounds = resolve(`var(${p.on})`, groundContext);
      for (const fg of fgs) for (const g of grounds) {
        assert.match(`${fg}${g}`, /^#[0-9a-f]{6}#[0-9a-f]{6}$/, `${theme} ${p.where}: ${fg} on ${g} is not an opaque pair`);
        const r = ratio(fg, g);
        if (!(r >= 4.5)) failing.push(`${theme} ${p.fg} ${fg} on ${p.on} ${g}: ${r.toFixed(2)} < 4.5 (${p.where})`);
      }
    }
  }
  assert.deepEqual(failing, []);
  // The decided grounds, pinned: brand-1 on background (hovered action); the selected hit on
  // highlight (brand-soft) with text-primary marks, action and icon (keepia/mail#37).
  const b = blocks();
  const ds = docsearchBlocks();
  assert.equal(ratio(b.light.get('--vp-c-brand-1'), ds.light.get('--docsearch-soft-primary-color')).toFixed(2), '4.99');
  assert.equal(ds.light.get('--docsearch-hit-highlight-color'), b.light.get('--vp-c-brand-soft'));
  assert.equal(ds.dark.get('--docsearch-hit-highlight-color'), b.dark.get('--vp-c-brand-soft'));
  assert.equal(ratio(b.light.get('--vp-c-text-1'), ds.light.get('--docsearch-hit-highlight-color')).toFixed(2), '13.94');
  assert.equal(ratio(b.dark.get('--vp-c-text-1'), ds.dark.get('--docsearch-hit-highlight-color')).toFixed(2), '13.73');
  // The hovered or focused action button in the selected hit lays rgba(0, 0, 0, 0.2) over the
  // Teal ground (not opaque, so not a pair above); its icon inherits the action's text-primary.
  for (const state of [':hover', ':focus']) {
    const layer = fixture.colorRules.filter((r) => r.file === '@docsearch/css/dist/style.css' && r.selector === `.DocSearch-Hit-action-button${state}`);
    // @docsearch/css has the rule twice (plain and under prefers-reduced-motion), both the same.
    assert.deepEqual([...new Set(layer.map((r) => `${r.property}: ${normColour(r.value)}`))], ['background: rgba(0, 0, 0, 0.2)'], state);
  }
  const over = (hex, alpha) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
  const composite = { light: over(ds.light.get('--docsearch-hit-highlight-color'), 0.2), dark: over(ds.dark.get('--docsearch-hit-highlight-color'), 0.2) };
  assert.deepEqual(composite, { light: '#7ec0c0', dark: '#022226' });
  assert.equal(ratio(b.light.get('--vp-c-text-1'), composite.light).toFixed(2), '8.78');
  assert.equal(ratio(b.dark.get('--vp-c-text-1'), composite.dark).toFixed(2), '15.16');
});

test('brand-soft guard: the context is the ancestry, and root var() values resolve on the root (Review A, keepia/design-system#7)', () => {
  const b = blocks();
  const resolve = resolverFor('light');
  const brand1 = b.light.get('--vp-c-brand-1');
  const soft = b.light.get('--vp-c-brand-soft');
  const r = (file, selector, property, value) => ({ file, selector, property, value, scoped: false });
  const DSF = '@docsearch/css/dist/style.css';
  assert.deepEqual(ancestry('.a + .b > c ~ d e').map((c) => c.type ?? c.classes[0]), ['d', 'e']);
  assert.deepEqual(ancestry('.p .a .b').length, 3);
  // 1. A selected hit's next sibling is not selected: its marks stay brand-1.
  const sibling = brandSoftFindings([
    r(CSS_PATH, '.DocSearch-Hit[aria-selected=true] + .DocSearch-Hit a', 'background-color', 'var(--vp-c-brand-soft)'),
    r(DSF, '.DocSearch-Hit mark', 'color', 'var(--docsearch-highlight-color)'),
  ], resolve, brand1, soft);
  assert.equal(sibling.length, 1, 'sibling combinator: context does not leak');
  // 2. :root's --docsearch-sidepanel-accent is var(--docsearch-highlight-color), computed on
  // the root: inside the selected hit it is still brand-1.
  const nested = brandSoftFindings([
    r(DSF, '.DocSearch-Hit[aria-selected=true] a', 'background-color', 'var(--docsearch-hit-highlight-color)'),
    r(DSF, '.DocSearch-Hit[aria-selected=true] .DocSearch-Hit-path', 'color', 'var(--docsearch-sidepanel-accent)'),
  ], resolve, brand1, soft);
  assert.equal(nested.length, 1, 'a root var() value is not resolved in the context');
  assert.ok(resolve('var(--docsearch-sidepanel-accent)', ancestry('.DocSearch-Hit[aria-selected=true] .DocSearch-Hit-path')).includes(brand1));
  // 3. The search button is in the nav bar, outside the portal.
  const button = brandSoftFindings([
    r(DSF, '.DocSearch-Button-Key', 'background', 'var(--vp-c-brand-soft)'),
    r('components/VPNavBar.vue', '.VPNavBar .DocSearch-Button-Key', 'color', 'var(--vp-c-brand-1)'),
  ], resolve, brand1, soft);
  assert.equal(button.length, 1, 'the search button is not in the portal');
  const modal = brandSoftFindings([
    r(DSF, '.DocSearch-Hit-source', 'background', 'var(--vp-c-brand-soft)'),
    r('components/VPNavBar.vue', '.VPNavBar .DocSearch-Hit-source', 'color', 'var(--vp-c-brand-1)'),
  ], resolve, brand1, soft);
  assert.equal(modal.length, 0, 'the modal is');
});

// keepia/mail#35, comment 6817584702 (Review A delta N1 on keepia/design-system#7): a scoped
// declaration's var()s are computed on its own element, so a declaration on a compound below
// it must not replace the root's value there.
test('brand-soft guard: a scoped declaration does not take a deeper compound\'s value in place of the root\'s (keepia/mail#35)', () => {
  const decl = (selector, property, value) => ({ file: 'probe.css', selector, property, value, media: null, important: false, layer: null, async: false, specificity: specificity(selector) });
  const base = [decl(':root', '--x', '#007d79'), decl('.hit', '--a', 'var(--x)'), decl('mark', '--x', '#161616')];
  const resolve = resolverFor('light', { base });
  const hitMark = ancestry('.hit mark');
  // The browser: --a on .hit is the root's --x, and mark inherits that value.
  assert.ok(resolve('var(--a)', hitMark).includes('#007d79'), 'the root\'s --x stays a value of --a');
  assert.deepEqual(resolve('var(--a)', hitMark).sort(), ['#007d79', '#161616'], 'mark\'s --x only adds a possible value');
  // A declaration on the element itself still replaces the root's value.
  assert.deepEqual(resolve('var(--x)', hitMark), ['#161616']);
  assert.deepEqual(resolve('var(--x)'), ['#007d79', '#161616'], 'no context: every value is possible');
});

// Review A delta N1/N2 on keepia/design-system#6: the resolver ranks custom properties by
// specificity and order only, and compares #hex, rgb() and rgba() literals. Neither
// `!important` nor `@layer` occurs on a custom property of the fixture, and no colour the
// guard resolves is an hsl() literal; these assertions keep that true for the next capture.
test('brand-soft guard: the fixture has no !important or @layer custom property and no hsl() colour', () => {
  assert.deepEqual(fixture.customProperties.filter((d) => d.important).map((d) => `${d.file} ${d.selector} ${d.property}`), []);
  assert.deepEqual(fixture.customProperties.filter((d) => d.layer !== null).map((d) => `${d.file} ${d.selector} ${d.property}`), []);
  assert.deepEqual(fixture.colorRules.filter((r) => /hsla?\(/i.test(r.value)).map((r) => `${r.file} ${r.selector} ${r.property}`), []);
  // hsla() occurs only in DocSearch's modal shadow, which is no colour rule's value.
  assert.deepEqual([...new Set(fixture.customProperties.filter((d) => /hsla?\(/i.test(d.value)).map((d) => d.property))], ['--docsearch-modal-shadow']);
  const hsl = [];
  for (const theme of ['light', 'dark']) {
    const resolve = resolverFor(theme);
    for (const r of guardRules()) if (resolve(r.value).some((v) => typeof v === 'string' && /hsla?\(/.test(v))) hsl.push(`${theme} ${r.file} ${r.selector} ${r.property}`);
  }
  assert.deepEqual(hsl, []);
});

test('brand-soft guard: it finds brand-1 text on, inside, above and next to a brand-soft ground', () => {
  const vars = new Map([['--vp-c-brand-1', '#007d79'], ['--vp-c-brand-soft', '#9ef0f0'], ['--vp-c-default-soft', '#9ef0f0'], ['--vp-c-text-1', '#161616']]);
  const resolve = (v) => splitTopLevel(v, ' ').map((p) => { const m = VAR.exec(p); return m ? vars.get(m[1]) ?? null : normColour(p); });
  const r = (file, selector, property, value, scoped = true) => ({ file, selector, property, value, scoped });
  const find = (rules) => brandSoftFindings(rules, resolve, '#007d79', '#9ef0f0');
  assert.equal(find([r('a.css', '.box', 'background', 'rgb(158, 240, 240)', false), r('a.css', '.box', 'color', 'rgb(0 125 121)', false)]).length, 1, 'rgb() literals');
  assert.equal(find([r('a.css', '.box', 'background', 'var(--vp-c-brand-soft) no-repeat', false), r('a.css', '.box a', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'a background shorthand');
  assert.equal(find([r('a.css', '.box .tag', 'background', 'var(--vp-c-brand-soft)', false), r('a.css', '.box .tag', 'color', 'inherit', false), r('b.css', '.box', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'own colour inherit');
  assert.equal(find([r('a.css', '.hit a', 'background', 'var(--vp-c-brand-soft)', false), r('a.css', '.hit mark', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'next to: a mark in the selected hit');
  assert.equal(find([r('components/VPLocalSearchBox.vue', 'mark', 'background', 'var(--vp-c-brand-soft)'), r('@docsearch/css/dist/style.css', 'mark', 'color', 'var(--vp-c-brand-1)', false)]).length, 0, 'the two search providers');
  assert.equal(find([r('components/VPLocalSearchBox.vue', 'mark', 'background', 'var(--vp-c-brand-soft)'), r('styles/base.css', 'mark', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'a global rule reaches a scoped ground');
  // VPMenuLink's hover with brand-soft mapped into the menu-link ground (default-soft).
  const hover = [r('components/VPMenuLink.vue', '.link:hover', 'color', 'var(--vp-c-brand-1)'), r('components/VPMenuLink.vue', '.link:hover', 'background-color', 'var(--vp-c-default-soft)')];
  assert.equal(find(hover).length, 1, 'the same rule');
  assert.equal(find([r('a.css', '.box', 'background', 'var(--vp-c-brand-soft)', false), r('b.css', '.box a', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'a link inside');
  assert.equal(find([r('a.css', '.box .tag', 'background', 'var(--vp-c-brand-soft)', false), r('b.css', '.box', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'inherited from an ancestor');
  assert.equal(find([r('a.css', '.box .tag', 'background', 'var(--vp-c-brand-soft)', false), r('a.css', '.box .tag', 'color', 'var(--vp-c-text-1)', false), r('b.css', '.box', 'color', 'var(--vp-c-brand-1)', false)]).length, 0, 'the ground sets its own colour');
  assert.equal(find([r('X.vue', '.a', 'background', 'var(--vp-c-brand-soft)'), r('Y.vue', '.a', 'color', 'var(--vp-c-brand-1)')]).length, 0, 'two components');
  assert.equal(find([r('a.css', '.box', 'background', 'var(--vp-c-brand-soft)', false), r('a.css', '.other', 'color', 'var(--vp-c-brand-1)', false)]).length, 0, 'another element');
  assert.equal(find([r('a.css', '.box', 'background', '#9ef0f0', false), r('a.css', '.box', 'color', '#007d79', false)]).length, 1, 'literal colours count too');
  // The DocSearch modal is a portal on <body>.
  const hit = r('@docsearch/css/dist/style.css', '.DocSearch-Hit[aria-selected=true] a', 'background-color', 'var(--vp-c-brand-soft)', false);
  assert.equal(find([hit, r('styles/components/vp-doc.css', '.vp-doc a', 'color', 'var(--vp-c-brand-1)', false)]).length, 0, 'page content outside the portal');
  assert.equal(find([hit, r('styles/base.css', 'a', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'a global rule reaches the portal');
  assert.equal(find([hit, r('styles/base.css', 'html.dark body a', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, 'html, body and .dark are above the portal');
  assert.equal(find([hit, r('@docsearch/css/dist/style.css', '.DocSearch-Hit mark', 'color', 'var(--vp-c-brand-1)', false)]).length, 1, "DocSearch's own rules");
  // Context: the text resolves where it meets the ground (resolve(value, context)).
  const ctxResolve = (v, context = []) => (context.some((c) => c.attrs.some((a) => a.name === 'aria-selected')) && v === 'var(--hl)' ? ['#161616'] : resolve(v === 'var(--hl)' ? 'var(--vp-c-brand-1)' : v));
  const ctxFind = (rules) => brandSoftFindings(rules, ctxResolve, '#007d79', '#9ef0f0');
  assert.equal(ctxFind([hit, r('@docsearch/css/dist/style.css', '.DocSearch-Hit mark', 'color', 'var(--hl)', false)]).length, 0, 'next to: resolved under the ground\'s ancestors');
  assert.equal(ctxFind([hit, r('@docsearch/css/dist/style.css', '.DocSearch-Hit[aria-selected=true] mark', 'color', 'var(--hl)', false)]).length, 0, 'inside the selected hit');
  assert.equal(ctxFind([r('a.css', '.box[aria-selected=true] .tag', 'background', 'var(--vp-c-brand-soft)', false), r('a.css', '.box', 'color', 'var(--hl)', false)]).length, 1, 'above: the text\'s own context, without the ground\'s');
});

// ---------------------------------------------------------------- fonts

test('fonts: every @font-face url() resolves to a font file in the package', () => {
  const faces = parsed.atRules.filter((a) => a.name === 'font-face');
  assert.equal(faces.length, FONT_FACES.length);
  assert.ok(EXPECTED_FILES.includes(CSS_PATH), `${CSS_PATH} is in the package`);
  for (const f of faces) {
    const src = f.decls.find((d) => d.prop === 'src').value;
    const urls = [...src.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    assert.equal(urls.length, 1, src);
    const file = path.posix.normalize(path.posix.join(path.posix.dirname(CSS_PATH), urls[0]));
    // fonts/ is what scripts/build.mjs writes and what the package ships (keepia/mail#7, part 5).
    assert.match(file, /^fonts\/IBMPlex(Sans|Mono)-[A-Za-z]+\.woff2$/, `${file} is not in fonts/`);
    assert.ok(EXPECTED_FILES.includes(file), `${file} is not in the package (check-pack EXPECTED_FILES)`);
    assert.ok(existsSync(path.join(ROOT, file)), `${file} does not exist`);
    assert.ok(f.decls.some((d) => d.prop === 'font-display' && d.value === 'swap'));
  }
  const weights = (family) => faces.filter((f) => f.decls.find((d) => d.prop === 'font-family').value === `"${family}"`).map((f) => f.decls.find((d) => d.prop === 'font-weight').value);
  assert.deepEqual(weights('IBM Plex Sans'), ['300', '400', '400', '600 700']);
  assert.deepEqual(weights('IBM Plex Mono'), ['400', '600 700']);
});

// ---------------------------------------------------------------- overrides

test('the fixture was captured with every classified property, longhands included', () => {
  assert.deepEqual(CLASSIFIED.filter((p) => !fixture.properties.includes(p)), []);
});

test('every VitePress rule that sets a corner, an outline, a font or a custom-block border is overridden or kept', () => {
  const open = fixture.rules.filter(needsClassification).filter((r) => !COVERED_KEYS.has(key(r.file, r.selector, r.property)) && !KEPT_KEYS.has(key(r.file, r.selector, r.property)));
  assert.deepEqual(open.map((r) => `${r.file}:${r.line} ${r.selector} { ${r.property}: ${r.value} }`), []);
});

test('every overridden or kept entry names a VitePress rule of the fixture', () => {
  for (const e of coverEntries) for (const c of e.covers) {
    assert.ok(fixtureRules(c.file, c.selector).some((r) => e.properties.some((p) => overridesProp(p, r.property)) && needsClassification(r)), `${c.file} ${c.selector}: no ${e.properties.join('/')} rule to override`);
  }
  for (const k of KEPT) {
    assert.ok(k.reason, `${k.file} ${k.selector}: no reason`);
    assert.ok(CLASSIFIED.includes(k.property) || isBorder(k.property), `${k.file} ${k.selector}: property ${k.property}`);
    assert.ok(fixtureRules(k.file, k.selector).some((r) => r.property === k.property && needsClassification(r)), `${k.file} ${k.selector}: no ${k.property} rule to keep`);
    assert.ok(!COVERED_KEYS.has(key(k.file, k.selector, k.property)), `${k.file} ${k.selector} ${k.property} is both kept and overridden`);
  }
});

test('every corner override is border-radius: 0 !important', () => {
  for (const c of CORNERS) {
    const rule = findRule(c.selectors);
    assert.deepEqual(rule.decls.map(declText), ['border-radius: 0 !important'], c.selectors.join(', '));
  }
});

test('covers() checks the ancestors, with the root of the component of a scoped rule', () => {
  const rule = (file, selector, scoped) => ({ file, selector, scoped });
  const footer = rule('components/VPDocFooter.vue', '.pager-link', true);
  assert.equal(covers('.VPDocFooter .pager-link', footer), true);
  assert.equal(covers('.VPDocFooter > .pager-link', footer), false, 'VitePress allows elements between the root and .pager-link');
  assert.equal(covers('.VPNav .pager-link', footer), false, 'an ancestor the rule does not sit in');
  assert.equal(covers('.VPDocFooter .pager-link', { ...footer, scoped: false }), false, 'unscoped: no component root');
  const excerpt = rule('components/VPLocalSearchBox.vue', ".excerpt :deep(.vp-code-group) div[class*='language-']", true);
  assert.equal(covers(".VPLocalSearchBox .excerpt.excerpt .vp-code-group div[class*='language-']", excerpt), true);
  assert.equal(covers(".VPLocalSearchBox .titles .vp-code-group div[class*='language-']", excerpt), false, 'a wrong ancestor class');
  const block = rule('styles/components/vp-doc.css', ".vp-doc .custom-block div[class*='language-']", false);
  assert.equal(covers(".vp-doc .custom-block div[class*='language-']", block), true);
  assert.equal(covers(".VPContent .vp-doc .custom-block div[class*='language-']", block), false);
  // The VitePress rule's own combinators: a child combinator only where it has one, and a
  // sibling compound is no ancestor.
  const copy = rule('styles/components/vp-doc.css', ".vp-doc [class*='language-'] > button.copy", false);
  assert.equal(covers(".vp-doc [class*='language-'] > button.copy", copy), true);
  assert.equal(covers(".vp-doc > [class*='language-'] > button.copy", copy), false, '.vp-doc is no parent there');
  const label = rule('styles/components/vp-code-group.css', '.vp-code-group input:checked + label', false);
  assert.equal(covers('.vp-code-group label', label), true);
  assert.equal(covers('.vp-code-group > label', label), false, 'input is the sibling, .vp-code-group no parent');
  assert.equal(covers('input label', label), false, 'the sibling is no ancestor');
  // VPSidebarGroup's root carries .group, not its name.
  assert.deepEqual(fixture.componentRoots['components/VPSidebarGroup.vue'], ['group']);
});

test('the capture records the static classes every root of a component carries', () => {
  const sfc = (t) => `<script setup>\nconst a = 1 > 0\n</script>\n\n<template>\n${t}\n</template>\n\n<style scoped>\n.x { color: red }\n</style>\n`;
  assert.deepEqual(rootClasses(sfc('<div class="VPA x" :class="{ y: a > 0 }"><span class="inner"><input class="i"><br/></span></div>')), ['VPA', 'x']);
  assert.deepEqual(rootClasses(sfc('<Teleport to="body"><Transition><div class="VPB"><p class="p" /></div></Transition></Teleport>')), ['VPB']);
  assert.deepEqual(rootClasses(sfc('<a v-if="x" class="VPC link"/>\n<!-- <b class="no"> -->\n<span v-else class="VPC text"><i class="no" /></span>')), ['VPC']);
  assert.deepEqual(rootClasses(sfc('<span ref="top" tabindex="-1" />\n<a class="VPD">x</a>')), [], 'a class-less root');
  assert.deepEqual(rootClasses(sfc('<template v-if="a"><div class="VPE one" /></template><div v-else class="VPE two" />')), ['VPE']);
  assert.throws(() => rootClasses(sfc('<div class="VPF"><span></div>')), /unbalanced/);
  assert.deepEqual(fixture.componentRoots['components/VPNavTranslations.vue'], ['VPNavTranslations'], 'common to its v-if branches');
  assert.equal(fixture.componentRoots['components/VPSkipLink.vue'], undefined, 'a fragment with a class-less root');
});

test('every overridden VitePress rule is targeted by the override and loses to it', () => {
  const failing = [];
  for (const e of coverEntries) {
    const rule = findRule(e.selectors);
    for (const r of coveredRules(e)) {
      const decl = rule.decls.find((d) => overridesProp(d.prop, r.property));
      assert.ok(decl, `${e.selectors.join(', ')} does not set ${r.property} (for ${r.file}:${r.line} ${r.selector})`);
      if (r.async && !decl.important && !r.layer) failing.push(`${r.file}:${r.line} ${r.selector} loads async, after vitepress.css: ${e.selectors.join(', ')} needs !important`);
      const winners = e.selectors.filter((alt) => covers(alt, r) && beats(alt, decl, r));
      if (!winners.length) failing.push(`${r.file}:${r.line} ${r.selector} ${formatSpecificity(r.specificity)}${r.important ? ' !important' : ''}${r.scoped ? ' scoped' : ''}: no selector of ${e.selectors.join(', ')} targets it and wins`);
    }
  }
  assert.deepEqual(failing, []);
});

test('focus and code rules match their elements, beat competing VitePress rules, and are not !important', () => {
  for (const e of RULES) {
    const rule = findRule([e.selector]);
    assert.deepEqual(rule.decls.map(declText), e.decls.map((d) => d.replace(/\s+/g, ' ')), e.selector);
    for (const d of rule.decls) assert.ok(!d.important, `${e.selector}: ${d.prop} is !important, so no VitePress rule could keep its own focus style`);
    for (const el of e.elements.map(withStates)) {
      const alt = applyingAlternative(e.selector, el);
      assert.ok(alt, `${e.selector} does not match its element ${JSON.stringify(el)}`);
      for (const d of rule.decls) {
        // Kept rules that carry an element must win instead (next test); other kept
        // rules (the custom-block frame) still have to lose where a Keepia rule applies.
        const competing = fixture.rules.filter((r) => overridesProp(d.prop, r.property) && !r.layer && !KEPT_WITH_ELEMENT.has(key(r.file, r.selector, r.property)) && selectorMatches(r.selector, el));
        for (const r of competing) {
          assert.ok(beats(alt, d, r), `${r.file}:${r.line} ${r.selector} ${formatSpecificity(r.specificity)} beats ${alt} ${formatSpecificity(specificity(alt))} on ${JSON.stringify(el)}`);
        }
      }
    }
  }
});

test('kept VitePress outline rules still win against every Keepia rule that matches their element', () => {
  const outlineSetters = keepiaAlternatives.filter((a) => a.decls.some((d) => d.prop === 'outline'));
  const OUTLINE = CLASSIFIED_GROUPS.outline;
  const failing = [];
  let checked = 0;
  for (const k of KEPT) {
    if (!OUTLINE.includes(k.property)) continue;
    for (const r of fixtureRules(k.file, k.selector).filter((x) => x.property === k.property)) {
      if (r.layer) { assert.ok(!r.important, `${r.selector} is a layered !important outline`); continue; }
      assert.ok(k.element, `${k.file} ${k.selector}: a kept outline rule needs the element it styles`);
      const el = withStates(k.element);
      assert.ok(selectorMatches(r.selector, el), `${r.selector} does not match its element ${JSON.stringify(el)}`);
      for (const a of outlineSetters.filter((x) => selectorMatches(x.selector, el))) {
        const d = a.decls.find((x) => x.prop === 'outline');
        if (beats(a.selector, d, r) || compareSpecificity(r.specificity, a.spec) <= 0) {
          failing.push(`kept ${r.file}:${r.line} ${r.selector} ${formatSpecificity(r.specificity)} does not beat ${a.selector} ${formatSpecificity(a.spec)}`);
        }
      }
      checked++;
    }
  }
  assert.deepEqual(failing, []);
  assert.ok(checked >= 10, `only ${checked} kept outline rules checked`);
});

test('on each of its elements, every Keepia rule out-ranks the other Keepia rules that set the same property', () => {
  // E.g. on a link-styled VPButton (<a class="VPButton">) the button's double ring must
  // apply, not the text-link outline on top of it.
  const failing = [];
  for (const e of RULES) for (const el of e.elements.map(withStates)) for (const d of findRule([e.selector]).decls) {
    const w = keepiaWinner(d.prop, el);
    if (norm(w.alt.rule.selector) !== norm(e.selector)) failing.push(`${JSON.stringify(el)} ${d.prop}: ${w.alt.selector} ${formatSpecificity(w.alt.spec)} applies instead of ${e.selector}`);
  }
  assert.deepEqual(failing, []);
  const button = withStates({ tag: 'a', classes: ['VPButton', 'medium', 'brand'], attrs: { href: '/' } });
  assert.equal(keepiaWinner('outline', button).decl.value, 'none');
  assert.equal(keepiaWinner('outline', button).alt.selector, '.VPButton:focus-visible');
});

test('custom blocks: each kind has a 3 px left stripe in its support colour, details has none', () => {
  // Pinned here, not read from the map.
  const want = { info: 'support-info', note: 'support-info', important: 'support-info', tip: 'support-success', warning: 'support-warning', caution: 'support-warning', danger: 'support-error' };
  assert.deepEqual(Object.keys(STRIPES).sort(), Object.keys(want).sort());
  assert.equal(CUSTOM_BLOCK_ELEMENTS.filter((el) => el.classes.includes('github-alert')).length, 5, 'the five GitHub alert kinds');
  const b = blocks();
  for (const el of BLOCK_ELEMENTS) {
    const kind = el.classes[0];
    if (kind === 'details') {
      const setters = keepiaAlternatives.filter((a) => a.decls.some((d) => isBorder(d.prop)) && selectorMatches(a.selector, el));
      assert.deepEqual(setters.map((a) => a.selector), [], 'details gets no border');
      for (const theme of ['light', 'dark']) assert.equal(b[theme].get('--vp-custom-block-details-border'), 'transparent');
      continue;
    }
    const w = keepiaWinner('border-left', el);
    assert.ok(w, `no left border on ${JSON.stringify(el)}`);
    const m = /^3px solid var\((--[\w-]+)\)$/.exec(w.decl.value);
    assert.ok(m, `${w.alt.selector}: border-left ${w.decl.value}`);
    for (const theme of ['light', 'dark']) {
      assert.equal(b[theme].get(m[1]), tokens[theme][want[kind]], `${theme} ${kind} stripe (${JSON.stringify(el.classes)})`);
    }
  }
  assert.equal(b.light.get('--keepia-vp-stripe-info'), '#0043ce');
  assert.equal(b.dark.get('--keepia-vp-stripe-info'), '#4589ff');
});

test("custom blocks: Carbon's 1 px frame, the support colour at Carbon's opacity 0.4, details has none", () => {
  // @carbon/styles: the low-contrast ::before has `border-width: 1px 1px 1px 0`,
  // `border-color: $support-<kind>` and `filter: opacity(0.4)`.
  const want = { info: 'support-info', note: 'support-info', important: 'support-info', tip: 'support-success', warning: 'support-warning', caution: 'support-warning', danger: 'support-error' };
  const b = blocks();
  // VitePress gives every block `border: 1px solid transparent` and colours it per kind.
  const frame = fixtureRules('styles/components/custom-block.css', '.custom-block').find((r) => r.property === 'border');
  assert.equal(frame.value, '1px solid transparent');
  for (const kind of [...Object.keys(want), 'details']) {
    const colour = fixtureRules('styles/components/custom-block.css', `.custom-block.${kind}`).find((r) => r.property === 'border-color');
    const m = /^var\((--[\w-]+)\)$/.exec(colour.value);
    assert.ok(m, colour.value);
    for (const theme of ['light', 'dark']) {
      const expected = kind === 'details' ? 'transparent' : rgba(tokens[theme][want[kind]], 0.4);
      assert.equal(b[theme].get(m[1]), expected, `${theme} ${kind} frame`);
    }
  }
  assert.equal(b.light.get('--vp-custom-block-info-border'), 'rgba(0, 67, 206, 0.4)');
  assert.equal(b.dark.get('--vp-custom-block-danger-border'), 'rgba(250, 77, 86, 0.4)');
});

// The Carbon icons as @carbon/icons describes them, read here independently of the build:
// viewBox, the outer path and the inner path (data-icon-path="inner-path"), with the
// whitespace in the path data as single spaces.
function carbonIcon(name) {
  const mod = requireFromRoot(ICON_MODULES[name]);
  const icon = mod.default ?? mod;
  assert.equal(icon.size, 20, `${name}: the 20 px icon`);
  const paths = icon.content.filter((c) => c.elem === 'path').map((c) => ({ d: c.attrs.d.split(/\s+/).join(' ').trim(), inner: c.attrs['data-icon-path'] === 'inner-path' }));
  return { viewBox: icon.attrs.viewBox, outer: paths.find((p) => !p.inner).d, inner: paths.find((p) => p.inner).d };
}
// The data: SVG of a custom property: viewBox and paths (fill, d).
function dataSvg(value) {
  const m = /^url\("data:image\/svg\+xml,([^"]+)"\)$/.exec(value);
  assert.ok(m, `not a data: SVG url: ${value.slice(0, 60)}`);
  const svg = decodeURIComponent(m[1]);
  return { svg, viewBox: /viewBox="([^"]+)"/.exec(svg)[1], paths: [...svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].map((p) => ({ fill: p[1], d: p[2] })) };
}

test('every icon carries the Apache-2.0 notice inside its SVG, which Lightning CSS keeps', () => {
  const b = blocks();
  const css = read(CSS_PATH);
  // By default Vite 8 minifies with Lightning CSS, and VitePress puts this file after its own
  // CSS: the leading /*! comment goes, each url() keeps its value but loses its quotes and
  // gets ( and ) escaped, so its decoded SVG is compared.
  const lightning = lightningTransform({ filename: 'style.css', code: Buffer.from(`.vp{color:red}\n${css}`), minify: true }).code.toString();
  assert.ok(!lightning.includes('/*!'), 'Lightning CSS drops the legal comment after other CSS');
  // A url() token is either quoted (raw parentheses allowed inside) or unquoted (with ( and )
  // escaped); the value is unquoted, unescaped and URI-decoded.
  const URL_VALUE = /--keepia-vp-icon-([a-z]+):url\(("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\\.|[^)\\])*)\)/g;
  const lightningSvgs = (kind) => [...lightning.matchAll(URL_VALUE)].filter((m) => m[1] === kind)
    .map((m) => decodeURIComponent(m[2].replace(/^(["'])([^]*)\1$/, '$2').replace(/\\(.)/g, '$1').replace(/^data:image\/svg\+xml,/, '')));
  for (const [kind, name] of Object.entries(BLOCK_ICONS)) {
    assert.match(iconNotice(name), new RegExp(`^<!-- Carbon icon ${name} \\(@carbon/icons\\), Copyright IBM Corp\\., Apache-2\\.0: https://www\\.apache\\.org/licenses/LICENSE-2\\.0 -->$`));
    for (const theme of ['light', 'dark']) {
      const value = b[theme].get(`--keepia-vp-icon-${kind}`);
      const { svg, viewBox } = dataSvg(value);
      assert.ok(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${iconNotice(name)}<path `), `${theme} ${kind}: the notice opens the SVG`);
    }
    // :root (light) first, then .dark.
    assert.deepEqual(lightningSvgs(kind), ['light', 'dark'].map((t) => dataSvg(b[t].get(`--keepia-vp-icon-${kind}`)).svg), `${kind}: Lightning CSS keeps both icons with their notice`);
  }
});

test("custom blocks: each kind has Carbon's filled icon before its title, details has none", () => {
  // Pinned here: Carbon's InlineNotification icons per kind.
  const want = {
    info: ['InformationFilled', 'support-info'], note: ['InformationFilled', 'support-info'], important: ['InformationFilled', 'support-info'],
    tip: ['CheckmarkFilled', 'support-success'], warning: ['WarningFilled', 'support-warning'], caution: ['WarningFilled', 'support-warning'], danger: ['ErrorFilled', 'support-error'],
  };
  assert.deepEqual(Object.keys(BLOCK_ICONS).sort(), Object.keys(want).sort());
  const b = blocks();
  const before = (kind) => `.custom-block.${kind} > .custom-block-title::before`;
  const geometry = findRule(Object.keys(want).map(before));
  assert.deepEqual(geometry.decls.filter((d) => ['content', 'width', 'height'].includes(d.prop)).map(declText), ['content: ""', 'width: 1.25rem', 'height: 1.25rem']);
  for (const [kind, [name, support]] of Object.entries(want)) {
    const rule = findRule([before(kind)]);
    assert.deepEqual(rule.decls.map(declText), [`background-image: var(--keepia-vp-icon-${kind})`]);
    const icon = carbonIcon(name);
    for (const theme of ['light', 'dark']) {
      const svg = dataSvg(b[theme].get(`--keepia-vp-icon-${kind}`));
      assert.equal(svg.viewBox, icon.viewBox, `${theme} ${kind} viewBox`);
      // The outer path in the support colour; the inner path is a cut-out, except on
      // WarningFilled, where Carbon fills it #000000.
      const expected = [{ fill: tokens[theme][support], d: icon.outer }];
      if (name === 'WarningFilled') expected.push({ fill: '#000000', d: icon.inner });
      assert.deepEqual(svg.paths, expected, `${theme} ${kind} icon`);
    }
  }
  // No rule in vitepress.css names the details block, and no icon reaches it or its
  // summary (the summary only gets the controls focus ring).
  const details = keepiaAlternatives.filter((a) => /\.details\b/.test(a.selector));
  assert.deepEqual(details.map((a) => a.selector), []);
  for (const el of [{ tag: 'details', classes: ['details', 'custom-block'] }, { tag: 'summary', pseudoElement: 'before' }]) {
    const setters = keepiaAlternatives.filter((a) => a.decls.some((d) => d.prop === 'background-image' || d.prop === 'content') && selectorMatches(a.selector, withStates(el)));
    assert.deepEqual(setters.map((a) => a.selector), [], JSON.stringify(el));
  }
});

test('the controls focus ring skips programmatic focus targets (tabindex="-1")', () => {
  const controls = RULES.find((r) => r.selector.includes('[tabindex]')).selector;
  const focused = (el) => ({ states: ['focus', 'focus-visible'], ...el });
  assert.equal(listMatches(controls, focused({ tag: 'nav', classes: ['nav'], attrs: { tabindex: '-1' } })), false);
  assert.equal(listMatches(controls, focused({ tag: 'h2', attrs: { id: 'x', tabindex: '-1' } })), false);
  assert.equal(listMatches(controls, focused({ tag: 'div', attrs: { tabindex: '0' } })), true);
  assert.equal(listMatches(controls, focused({ tag: 'button' })), true);
});

test('the nav title keeps VitePress: no Keepia rule targets it (the product lockup is the logo, siteTitle: false)', () => {
  const title = withStates({ tag: 'a', classes: ['title'], attrs: { href: '/' } });
  // Only the text-link focus ring reaches the title link.
  const setters = keepiaAlternatives.filter((a) => selectorMatches(a.selector, title)).map((a) => a.selector);
  assert.deepEqual(setters, ['a:focus-visible']);
  assert.ok(!/VPNavBarTitle/.test(read(CSS_PATH)), 'no rule names VPNavBarTitle');
  assert.ok(!keepiaAlternatives.some((a) => a.decls.some((d) => d.prop === 'font-family')), 'no rule sets a font family; the font stacks are variables');
});

test('inline code in custom blocks: the Keepia colour rule beats every block code rule', () => {
  const ours = specificity(applyingAlternative(RULES.find((r) => r.area === 'Code').selector, { tag: 'code' }));
  for (const kind of ['info', 'note', 'tip', 'important', 'warning', 'caution', 'danger', 'details']) {
    // styles/components/custom-block.css: `.custom-block.info a, .custom-block.info code { color: var(--vp-c-brand-1) }`
    assert.ok(compareSpecificity(ours, specificity(`.custom-block.${kind} code`)) > 0, kind);
  }
});
