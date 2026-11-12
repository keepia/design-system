// The CSS helpers that the VitePress theme tests and the fixture capture rely on (ported from
// pklnx/design-system, keepia/mail#7, part 4). The expected specificities are worked out by
// hand from the selectors spec and match the numbers in the plan reviews of
// pklnx/design-system#10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compoundsOf, parseCss, selectorMatches, selectorMatchesPath, specificity, splitTopLevel, subjectCompound, unwrapDeep } from './css-selectors.mjs';

test('specificity of plain, scoped and :deep() selectors', () => {
  const cases = [
    ['.VPBadge', {}, [0, 1, 0]],
    ['.VPButton.medium', { scoped: true }, [0, 3, 0]],
    ['.pager-link', { scoped: true }, [0, 2, 0]],
    ['.titles :deep(mark)', { scoped: true }, [0, 2, 1]],
    [".excerpt :deep(.vp-code-group) div[class*='language-']", { scoped: true }, [0, 4, 1]],
    [".VPLocalSearchBox .excerpt.excerpt .vp-code-group div[class*='language-']", {}, [0, 5, 1]],
    ['.vp-doc .custom-block :not(a) > code', {}, [0, 2, 2]],
    ['.custom-block.tip code', {}, [0, 2, 1]],
    ['.custom-block.info a:hover > code', {}, [0, 3, 2]],
    ['.vp-doc :not(pre) > code', {}, [0, 1, 2]],
    [".vp-doc [class*='language-'] > button.copy:hover.copied::before", {}, [0, 5, 2]],
    ['.vp-code-group .tabs label::after', {}, [0, 2, 2]],
    ['a:before', {}, [0, 0, 2]],
    ['#VPContent a', {}, [1, 0, 1]],
    [':root:where(:has(.vp-graded-containers))', {}, [0, 1, 0]],
    [':-moz-focusring:where(:not(iframe))', {}, [0, 1, 0]],
    ['button:focus-visible', {}, [0, 1, 1]],
    ['a:focus-visible', {}, [0, 1, 1]],
    ['.VPButton:focus-visible', {}, [0, 2, 0]],
    ['[tabindex]:focus-visible', {}, [0, 2, 0]],
    ['[tabindex]:not([tabindex="-1"]):focus-visible', {}, [0, 3, 0]],
    [':where(button, input, [tabindex]:not([tabindex="-1"])):focus-visible', {}, [0, 1, 0]],
    [':is(.a, #b) > p', {}, [1, 0, 1]],
    ['*', {}, [0, 0, 0]],
  ];
  for (const [sel, opts, want] of cases) assert.deepEqual(specificity(sel, opts), want, sel);
});

test(':deep() reads as a descendant, as Vue compiles it', () => {
  assert.equal(unwrapDeep('.excerpt :deep(.vp-code-group) div'), '.excerpt .vp-code-group div');
  assert.equal(unwrapDeep('.a:deep(.b)'), '.a .b');
  assert.deepEqual(subjectCompound('.titles :deep(mark)').type, 'mark');
});

test('subject compound: type, classes, attributes, pseudo-classes, pseudo-element', () => {
  const c = subjectCompound(".vp-doc [class*='language-'] > button.copy:hover.copied::before");
  assert.equal(c.type, 'button');
  assert.deepEqual(c.classes, ['copy', 'copied']);
  assert.deepEqual(c.pseudos.map((p) => p.name), ['hover']);
  assert.equal(c.pseudoElement, 'before');
  assert.deepEqual(subjectCompound("div[class*='language-']").attrs, [{ name: 'class', op: '*=', value: 'language-' }]);
});

test('selector matching: :where(), :not(), states and pseudo-elements', () => {
  const controls = ':where(button, input, [tabindex]:not([tabindex="-1"])):focus-visible';
  const focused = (el) => ({ states: ['focus', 'focus-visible'], ...el });
  assert.equal(selectorMatches(controls, focused({ tag: 'button' })), true);
  assert.equal(selectorMatches(controls, focused({ tag: 'div', attrs: { tabindex: '0' } })), true);
  assert.equal(selectorMatches(controls, focused({ tag: 'nav', attrs: { tabindex: '-1' } })), false);
  assert.equal(selectorMatches(controls, focused({ tag: 'a' })), false);
  assert.equal(selectorMatches(controls, { tag: 'button' }), false, 'not focused');
  assert.equal(selectorMatches('a:focus', focused({ tag: 'a' })), true, 'focus-visible implies focus');
  assert.equal(selectorMatches('.nav', { tag: 'nav', classes: ['nav'] }), true);
  assert.equal(selectorMatches('.VPButton.medium', { tag: 'a', classes: ['VPButton'] }), false);
  assert.equal(selectorMatches("[class*='language-']", { tag: 'div', classes: ['language-js', 'vp-adaptive-theme'] }), true);
  assert.equal(selectorMatches('button.copy::before', { tag: 'button', classes: ['copy'] }), false);
  assert.equal(selectorMatches('button.copy::before', { tag: 'button', classes: ['copy'], pseudoElement: 'before' }), true);
});

test('parseCss: at-rule context, nesting, !important and line numbers', () => {
  const css = [
    '/* a { b } */',
    '@layer base {',
    '  button:focus { outline: none; }',
    '}',
    '@media (min-width: 40rem) {',
    "  .a, .b { border-radius: 0.5rem !important; background: url('x;{y}.png'); }",
    '}',
    '.p { color: red; .q { font-family: inherit; } }',
    '@font-face { font-family: "X"; src: url("x.woff2"); }',
    '@keyframes spin { from { opacity: 0 } to { opacity: 1 } }',
  ].join('\n');
  const { rules, atRules } = parseCss(css);
  assert.deepEqual(rules.map((r) => r.selector), ['button:focus', '.a, .b', '.q', '.p']);
  const [focus, ab, q, p] = rules;
  assert.equal(focus.layer, 'base');
  assert.equal(focus.line, 3);
  assert.equal(ab.media, '(min-width: 40rem)');
  assert.deepEqual(ab.decls[0], { prop: 'border-radius', value: '0.5rem', important: true });
  assert.equal(ab.decls[1].value, "url('x;{y}.png')");
  assert.equal(ab.line, 6);
  assert.deepEqual(q.parents, ['.p']);
  assert.deepEqual(p.decls.map((d) => d.prop), ['color']);
  assert.deepEqual(atRules.map((a) => a.name), ['layer', 'media', 'font-face', 'keyframes']);
  assert.deepEqual(atRules.find((a) => a.name === 'font-face').decls.map((d) => d.prop), ['font-family', 'src']);
  assert.deepEqual(splitTopLevel(':where(a, b), c[x=","]', ','), [':where(a, b)', 'c[x=","]']);
});

test('compoundsOf: the compounds left to right with their combinators, :deep() unwrapped', () => {
  const cs = compoundsOf(".excerpt :deep(.vp-code-group) > div[class*='language-'] + p.x");
  assert.deepEqual(cs.map((c) => [c.combinator, c.type, c.classes]), [
    [null, null, ['excerpt']], [' ', null, ['vp-code-group']], ['>', 'div', []], ['+', 'p', ['x']],
  ]);
  assert.deepEqual(cs[2].attrs, [{ name: 'class', op: '*=', value: 'language-' }]);
  const { combinator, ...subject } = cs.at(-1);
  assert.deepEqual(subjectCompound(".excerpt :deep(.vp-code-group) > div[class*='language-'] + p.x"), subject);
});

test('selectorMatchesPath: descendant and child combinators against the ancestors', () => {
  const path = [{ tag: 'div', classes: ['a'] }, { tag: 'section', classes: ['b'] }, { tag: 'p', classes: ['c'] }];
  assert.equal(selectorMatchesPath('.a .c', path), true);
  assert.equal(selectorMatchesPath('.a > .b > .c', path), true);
  assert.equal(selectorMatchesPath('.a > .c', path), false, '.c is no child of .a');
  assert.equal(selectorMatchesPath('.b .a .c', path), false, 'order of the ancestors');
  assert.equal(selectorMatchesPath('.x .c', path), false, 'an ancestor the path does not hold');
  assert.equal(selectorMatchesPath('.a .x', path), false, 'the subject');
  assert.equal(selectorMatchesPath('.a .x + .c', path), true, 'a sibling compound counts as matching');
  assert.equal(selectorMatchesPath('.z .x + .c', path), false, 'the ancestors before a sibling compound still count');
  assert.equal(selectorMatchesPath('.a :not(.b) > .c', path), false);
  assert.equal(selectorMatchesPath(':not(.x) > .c', path), true);
  // Unknown elements may lie between .a and .c: a child combinator does not match across the gap.
  const gap = [{ tag: 'div', classes: ['a'] }, { tag: 'p', classes: ['c'], gapAbove: true }];
  assert.equal(selectorMatchesPath('.a .c', gap), true);
  assert.equal(selectorMatchesPath('.a > .c', gap), false);
});
