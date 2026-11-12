// Small CSS helpers for the VitePress theme (theme/vitepress.css), ported unchanged from
// pklnx/design-system (keepia/mail#7, part 4):
//   parseCss()        style rules with their at-rule context (@media, @layer), flat or nested
//   specificity()     selector specificity, including Vue's :deep() and the scoped attribute
//   subjectCompound() the last compound selector of a selector (the element it styles)
//   matchesCompound() whether a compound selector matches a described element
// They cover the selectors of VitePress's default theme and of theme/vitepress.css,
// not all of CSS. Used by scripts/capture-vitepress-fixture.mjs and the tests.

// Splits `text` at top-level occurrences of `sep`, outside (), [] and quotes.
export function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function parseDeclarations(text) {
  const decls = [];
  for (const d of splitTopLevel(text, ';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const prop = d.slice(0, i).trim();
    let value = d.slice(i + 1).trim().replace(/\s+/g, ' ');
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important$/i, '');
    decls.push({ prop, value, important });
  }
  return decls;
}

// Parses CSS into { rules, atRules }.
//   rules:   [{ selector, decls: [{ prop, value, important }], media, layer, supports, parents, line }]
//            one entry per style rule (not per selector of a list); `parents` holds the
//            selectors of enclosing style rules (CSS nesting), `line` is 1-based.
//   atRules: [{ name, prelude, depth, decls?, line }] every at-rule (block or statement);
//            depth 0 is the top level. @font-face and @page carry their declarations.
// Keyframe selectors (`from`, `50%`) are not reported as style rules.
export function parseCss(source) {
  // Comments are blanked to spaces (newlines kept), so line numbers stay right.
  const css = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = [];
  const atRules = [];
  const stack = []; // { kind: 'style' | 'at', prelude, name, decls: '', line }
  let buf = '';
  let bufStart = 0;
  let quote = null;
  let paren = 0;
  const lineAt = (i) => css.slice(0, i).split('\n').length;
  const firstNonSpace = (from) => { let i = from; while (i < css.length && /\s/.test(css[i])) i++; return i; };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') { buf += ch + css[++i]; continue; }
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (paren > 0) { buf += ch; continue; }
    if (ch === '{') {
      // Declarations before a nested rule belong to the enclosing rule.
      const semi = buf.lastIndexOf(';');
      const top = stack[stack.length - 1];
      if (semi >= 0 && top) top.decls += buf.slice(0, semi + 1);
      const preludeOffset = semi >= 0 ? bufStart + semi + 1 : bufStart;
      const prelude = buf.slice(semi + 1).trim().replace(/\s+/g, ' ');
      const line = lineAt(firstNonSpace(preludeOffset));
      if (prelude.startsWith('@')) {
        const m = /^@([\w-]+)\s*(.*)$/.exec(prelude);
        stack.push({ kind: 'at', name: m[1].toLowerCase(), prelude: m[2], decls: '', line });
      } else {
        const inKeyframes = stack.some((s) => s.kind === 'at' && /keyframes$/.test(s.name));
        stack.push({ kind: inKeyframes ? 'keyframe' : 'style', prelude, decls: '', line });
      }
      buf = '';
      bufStart = i + 1;
      continue;
    }
    if (ch === '}') {
      const ctx = stack.pop();
      if (!ctx) throw new Error(`unbalanced } at line ${lineAt(i)}`);
      ctx.decls += buf;
      const atCtx = stack.filter((s) => s.kind === 'at');
      if (ctx.kind === 'style') {
        rules.push({
          selector: ctx.prelude,
          decls: parseDeclarations(ctx.decls),
          media: atCtx.filter((s) => s.name === 'media').map((s) => s.prelude).join(' and ') || null,
          layer: atCtx.filter((s) => s.name === 'layer').map((s) => s.prelude).join('.') || null,
          supports: atCtx.filter((s) => s.name === 'supports').map((s) => s.prelude).join(' and ') || null,
          parents: stack.filter((s) => s.kind === 'style').map((s) => s.prelude),
          line: ctx.line,
        });
      } else if (ctx.kind === 'at') {
        const entry = { name: ctx.name, prelude: ctx.prelude, depth: atCtx.length, line: ctx.line };
        if (ctx.name === 'font-face' || ctx.name === 'page') entry.decls = parseDeclarations(ctx.decls);
        atRules.push(entry);
      }
      buf = '';
      bufStart = i + 1;
      continue;
    }
    if (ch === ';' && stack.length === 0) {
      const stmt = buf.trim();
      if (stmt.startsWith('@')) {
        const m = /^@([\w-]+)\s*(.*)$/s.exec(stmt);
        atRules.push({ name: m[1].toLowerCase(), prelude: m[2].replace(/\s+/g, ' '), depth: 0, line: lineAt(firstNonSpace(bufStart)) });
      }
      buf = '';
      bufStart = i + 1;
      continue;
    }
    buf += ch;
  }
  if (stack.length) throw new Error('unclosed block at end of CSS');
  return { rules, atRules };
}

// ---------------------------------------------------------------- selectors

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

// Reads one simple selector at `i`; returns { token, end }.
// token: { kind: 'type'|'universal'|'id'|'class'|'attr'|'pseudo'|'pseudo-element'|'combinator', name, args, op, value }
function readToken(sel, i) {
  const ident = (j) => { const m = /^-?[_a-zA-Z\u00a0-\uffff][-\w\u00a0-\uffff]*|^-?\\./.exec(sel.slice(j)); return m ? m[0] : ''; };
  const ch = sel[i];
  if (/[\s>+~]/.test(ch)) {
    let j = i;
    let comb = ' ';
    while (j < sel.length && /[\s>+~]/.test(sel[j])) { if (sel[j] !== ' ' && !/\s/.test(sel[j])) comb = sel[j]; j++; }
    return { token: { kind: 'combinator', name: comb }, end: j };
  }
  if (ch === '*') return { token: { kind: 'universal' }, end: i + 1 };
  if (ch === '&') return { token: { kind: 'nesting' }, end: i + 1 };
  if (ch === '#') { const n = ident(i + 1); return { token: { kind: 'id', name: n }, end: i + 1 + n.length }; }
  if (ch === '.') { const n = ident(i + 1); return { token: { kind: 'class', name: n }, end: i + 1 + n.length }; }
  if (ch === '[') {
    let j = i + 1;
    let quote = null;
    while (j < sel.length && (quote || sel[j] !== ']')) {
      if (quote) { if (sel[j] === quote) quote = null; } else if (sel[j] === '"' || sel[j] === "'") quote = sel[j];
      j++;
    }
    const body = sel.slice(i + 1, j).trim();
    const m = /^([-\w]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(i|s)?)?$/.exec(body);
    if (!m) throw new Error(`cannot parse attribute selector [${body}]`);
    return { token: { kind: 'attr', name: m[1], op: m[2] || null, value: m[3] ?? m[4] ?? m[5] ?? null }, end: j + 1 };
  }
  if (ch === ':') {
    const element = sel[i + 1] === ':';
    const start = i + (element ? 2 : 1);
    const name = ident(start).toLowerCase();
    let end = start + name.length;
    let args = null;
    if (sel[end] === '(') {
      let depth = 0;
      let j = end;
      for (; j < sel.length; j++) {
        if (sel[j] === '(') depth++;
        else if (sel[j] === ')' && --depth === 0) break;
      }
      args = sel.slice(end + 1, j);
      end = j + 1;
    }
    const kind = element || LEGACY_PSEUDO_ELEMENTS.has(name) ? 'pseudo-element' : 'pseudo';
    return { token: { kind, name, args }, end };
  }
  const n = ident(i);
  if (!n) throw new Error(`cannot parse selector "${sel}" at ${i}`);
  return { token: { kind: 'type', name: n.toLowerCase() }, end: i + n.length };
}

// Vue compiles `.a :deep(.b)` (and `.a:deep(.b)`) to `.a[data-v-x] .b`: the argument
// becomes a descendant. This rewrites :deep() so the selector reads as compiled,
// without the scope attribute (specificity() adds that).
export function unwrapDeep(sel) {
  let out = sel;
  for (;;) {
    const i = out.indexOf(':deep(');
    if (i < 0) return out.replace(/\s+/g, ' ').trim();
    let depth = 0;
    let j = i + 5;
    for (; j < out.length; j++) {
      if (out[j] === '(') depth++;
      else if (out[j] === ')' && --depth === 0) break;
    }
    out = `${out.slice(0, i)} ${out.slice(i + 6, j)}${out.slice(j + 1)}`;
  }
}

export function tokenize(sel) {
  const s = sel.trim();
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const { token, end } = readToken(s, i);
    tokens.push(token);
    i = end;
  }
  return tokens;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const compareSpecificity = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
const maxSpec = (list) => list.reduce((m, s) => (compareSpecificity(s, m) > 0 ? s : m), [0, 0, 0]);

// Specificity [ids, classes/attributes/pseudo-classes, types/pseudo-elements] of one
// selector (not a list). `scoped` adds Vue's [data-v-…] attribute: (0,1,0).
export function specificity(selector, { scoped = false } = {}) {
  let spec = scoped ? [0, 1, 0] : [0, 0, 0];
  for (const t of tokenize(unwrapDeep(selector))) {
    switch (t.kind) {
      case 'id': spec = add(spec, [1, 0, 0]); break;
      case 'class': case 'attr': spec = add(spec, [0, 1, 0]); break;
      case 'type': case 'pseudo-element': spec = add(spec, [0, 0, 1]); break;
      case 'pseudo':
        if (t.name === 'where') break;
        if (['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'].includes(t.name)) {
          spec = add(spec, maxSpec(splitTopLevel(t.args, ',').map((s) => specificity(s))));
        } else if (['global', 'slotted'].includes(t.name)) {
          spec = add(spec, maxSpec(splitTopLevel(t.args, ',').map((s) => specificity(s))));
        } else if (/^nth-(last-)?child$/.test(t.name) && / of /.test(t.args ?? '')) {
          spec = add(add(spec, [0, 1, 0]), maxSpec(splitTopLevel(t.args.split(/ of /)[1], ',').map((s) => specificity(s))));
        } else {
          spec = add(spec, [0, 1, 0]);
        }
        break;
      default: break; // universal, nesting, combinator
    }
  }
  return spec;
}

export const formatSpecificity = (s) => `(${s.join(',')})`;

// The compound selector the simple-selector tokens `tokens` make up.
function compoundOf(tokens) {
  const c = { type: null, ids: [], classes: [], attrs: [], pseudos: [], pseudoElement: null };
  for (const t of tokens) {
    if (t.kind === 'type') c.type = t.name;
    else if (t.kind === 'id') c.ids.push(t.name);
    else if (t.kind === 'class') c.classes.push(t.name);
    else if (t.kind === 'attr') c.attrs.push({ name: t.name, op: t.op, value: t.value });
    else if (t.kind === 'pseudo') c.pseudos.push({ name: t.name, args: t.args });
    else if (t.kind === 'pseudo-element') c.pseudoElement = t.name;
  }
  return c;
}

// The compound selectors of `selector` (after :deep() is unwrapped), left to right, each as
// { type, ids, classes, attrs: [{ name, op, value }], pseudos: [{ name, args }], pseudoElement }
// with `combinator`: the combinator before it (' ', '>', '+', '~'), null for the first.
export function compoundsOf(selector) {
  const out = [];
  let tokens = [];
  let combinator = null;
  for (const t of tokenize(unwrapDeep(selector))) {
    if (t.kind !== 'combinator') { tokens.push(t); continue; }
    out.push({ ...compoundOf(tokens), combinator });
    combinator = t.name;
    tokens = [];
  }
  out.push({ ...compoundOf(tokens), combinator });
  return out;
}

// The last compound selector of `selector` (after :deep() is unwrapped), as
// { type, ids, classes, attrs: [{ name, op, value }], pseudos: [{ name, args }], pseudoElement }.
export function subjectCompound(selector) {
  const { combinator, ...c } = compoundsOf(selector).at(-1);
  return c;
}

// An element as a test describes it: { tag, classes, attrs: { name: value }, states, pseudoElement }.
// states lists the user-action pseudo-classes it is in (focus, focus-visible, hover, active).
const STATE_PSEUDOS = new Set(['focus', 'focus-visible', 'focus-within', 'hover', 'active']);

function attrMatches(a, el) {
  const value = a.name === 'class' ? (el.classes ?? []).join(' ') || el.attrs?.class : el.attrs?.[a.name];
  if (value === undefined || value === null) return false;
  if (!a.op) return true;
  const v = String(value);
  switch (a.op) {
    case '=': return v === a.value;
    case '~=': return v.split(/\s+/).includes(a.value);
    case '|=': return v === a.value || v.startsWith(`${a.value}-`);
    case '^=': return v.startsWith(a.value);
    case '$=': return v.endsWith(a.value);
    case '*=': return v.includes(a.value);
    default: return false;
  }
}

// Whether compound selector `c` matches element `el`. Pseudo-classes that depend on
// the document (:first-child, :lang(), :-moz-focusring …) count as matching, so the
// answer errs towards "matches".
export function matchesCompound(c, el) {
  if (c.type && c.type !== el.tag) return false;
  if ((c.pseudoElement ?? null) !== (el.pseudoElement ?? null)) return false;
  for (const id of c.ids) if (el.attrs?.id !== id) return false;
  for (const cls of c.classes) if (!(el.classes ?? []).includes(cls)) return false;
  for (const a of c.attrs) if (!attrMatches(a, el)) return false;
  const states = new Set(el.states ?? []);
  if (states.has('focus-visible')) states.add('focus');
  for (const p of c.pseudos) {
    if (STATE_PSEUDOS.has(p.name)) { if (!states.has(p.name)) return false; continue; }
    if (['where', 'is', 'matches'].includes(p.name)) {
      if (!splitTopLevel(p.args, ',').some((s) => matchesCompound(subjectCompound(s), { ...el, pseudoElement: null }))) return false;
      continue;
    }
    if (p.name === 'not') {
      if (splitTopLevel(p.args, ',').some((s) => matchesCompound(subjectCompound(s), { ...el, pseudoElement: null }))) return false;
      continue;
    }
  }
  return true;
}

// Whether `selector` (a single selector) can match `el`, judged by its subject compound.
export const selectorMatches = (selector, el) => matchesCompound(subjectCompound(selector), el);

// Whether `selector` (a single selector) can match the last element of `path`, a list of
// elements from an ancestor down, each the child of the one before, or a descendant of it
// where the element has `gapAbove` (unknown elements may lie between). Descendant and child
// combinators are checked against the path; a child combinator never matches across a gap.
// The compound before a sibling combinator (+, ~) names a sibling, which the path does not
// hold, so it counts as matching (the answer errs towards "matches", as in matchesCompound).
export function selectorMatchesPath(selector, path) {
  const cs = compoundsOf(selector);
  const at = (ci, pi) => matchesCompound(cs[ci], path[pi]) && before(ci, pi);
  // Whether the compounds before cs[ci] match, for cs[ci] on path[pi].
  const before = (ci, pi) => {
    if (ci === 0) return true;
    const comb = cs[ci].combinator;
    if (comb === '>') return pi > 0 && !path[pi].gapAbove && at(ci - 1, pi - 1);
    if (comb === ' ') {
      for (let p = pi - 1; p >= 0; p--) if (at(ci - 1, p)) return true;
      return false;
    }
    return before(ci - 1, pi);
  };
  return path.length > 0 && at(cs.length - 1, path.length - 1);
}

// The element a compound describes, for a test that asks whether another selector
// matches every element this one matches. States are those of the compound plus
// focus, focus-visible and hover.
export function elementOf(c) {
  const attrs = {};
  for (const a of c.attrs) if (a.name !== 'class') attrs[a.name] = a.value ?? '';
  const classAttr = c.attrs.filter((a) => a.name === 'class' && a.value).map((a) => a.value);
  return {
    tag: c.type,
    classes: [...c.classes, ...classAttr],
    attrs,
    states: [...new Set([...c.pseudos.filter((p) => STATE_PSEUDOS.has(p.name)).map((p) => p.name), 'focus', 'focus-visible', 'hover'])],
    pseudoElement: c.pseudoElement,
  };
}
