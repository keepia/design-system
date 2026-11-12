// Tests of the logo, lockups, app icons and favicons (keepia/mail#7, part 3; tests L1–L11 of
// the plan, comment 6807557665): the geometry in theme/logo-geometry.json, the brand SVGs, the
// PNGs, favicon.ico, the manifest and the sign-off sheets in brand/.
//
// The reference values are spelled out here, not read from theme/brand.json: the maintainer's
// decision on the mark (keepia/mail#7, comment 6807193549, R3) and the outline the plan derived
// from it. A changed brand.json therefore fails these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { markGeometry, outline } from './build_logo.mjs';
import { ratio } from './contrast.mjs';
import { decodeRGBA, ihdr, readIco, render, sha256, textChunks } from './png.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p));
const readText = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const B = 'brand';
const brandFile = (f) => readText(`${B}/${f}`);

const brand = JSON.parse(readText('theme/brand.json'));
const geo = JSON.parse(readText('theme/logo-geometry.json'));
const tokens = JSON.parse(readText('theme/tokens.json'));
const manifest = JSON.parse(readText(`${B}/manifest.json`));

// The decision (comment 6807193549, item 1) on the 32-unit grid.
const TEAL60 = '#007d79';
const WHITE = '#ffffff';
const DECIDED = {
  tile: { x: 0, y: 0, width: 32, height: 32, rx: 7 },
  bar: { x: 7, y: 7, width: 5, height: 18, rx: 1 },
  tongue: { x: 14, y: 14.25, width: 4, height: 3.5 },
};
// The chevron outline of the plan: cap corners, outer miter tip and inner joint.
const OUTLINE = [[23.0794, 5.3995], [14.2457, 16], [23.0794, 26.6005], [26.9206, 23.3995], [20.7543, 16], [26.9206, 8.6005]];
// The stroke reference: the decided primitives with the chevron as a stroke.
const REFERENCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect fill="${TEAL60}" width="32" height="32" rx="7"/>
<rect fill="${WHITE}" x="7" y="7" width="5" height="18" rx="1"/>
<rect fill="${WHITE}" x="14" y="14.25" width="4" height="3.5"/>
<polyline fill="none" stroke="${WHITE}" stroke-width="5" stroke-linejoin="miter" stroke-linecap="butt" points="25,7 17.5,16 25,25"/>
</svg>`;

const VARIANTS = ['light', 'dark', 'black', 'white'];
const PRODUCTS = ['mail', 'docs', 'archive'];
const LOCKUPS = [null, ...PRODUCTS].flatMap((p) => VARIANTS.flatMap((v) => {
  const stem = p ? `keepia-${p}-lockup` : 'keepia-lockup';
  return [{ file: `${stem}-${v}.svg`, product: p, variant: v, kind: 'horizontal' }, { file: `${stem}-stacked-${v}.svg`, product: p, variant: v, kind: 'stacked' }];
}));
const BRAND_SVGS = [
  'keepia-mark.svg', 'favicon.svg', 'keepia-mark-teal.svg', 'keepia-mark-black.svg', 'keepia-mark-white.svg',
  ...VARIANTS.map((v) => `keepia-wordmark-${v}.svg`), ...LOCKUPS.map((l) => l.file),
  'icon-maskable.svg', 'apple-touch-icon.svg',
];
const SHEETS = ['preview-white.svg', 'preview-g100.svg', 'preview-icons.svg'];
// png → [width, height, source]
const PNGS = {
  'favicon-16.png': [16, 16, 'keepia-mark.svg'], 'favicon-32.png': [32, 32, 'keepia-mark.svg'], 'favicon-48.png': [48, 48, 'keepia-mark.svg'],
  'icon-192.png': [192, 192, 'keepia-mark.svg'], 'icon-512.png': [512, 512, 'keepia-mark.svg'],
  'icon-maskable-512.png': [512, 512, 'icon-maskable.svg'],
  'apple-touch-icon.png': [180, 180, 'apple-touch-icon.svg'], 'icon-1024.png': [1024, 1024, 'apple-touch-icon.svg'],
};

// ---------------------------------------------------------------- SVG reading
const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const viewBox = (svg) => /viewBox="([^"]*)"/.exec(svg)[1].split(' ').map(Number);
const colours = (svg) => new Set([...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()));
const num = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'fill' && k !== 'tag').map(([k, v]) => [k, Number(v)]));
// The mark's shapes as drawn: [{ tag, fill, ... }].
const shapes = (svg) => [...svg.matchAll(/<(rect|path) ([^>]*?)\/>/g)].map((m) => ({ tag: m[1], ...attrs(m[2]) }));

// The transform of the mark group in a lockup.
function markGroup(svg) {
  const m = /<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)">/.exec(svg);
  assert.ok(m, 'mark group');
  return { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) };
}
// The text paths of a lockup or wordmark (outside the mark group): [{ fill, x, d }].
function textPaths(svg) {
  const outside = svg.replace(/<g transform[\s\S]*?<\/g>/, '');
  return [...outside.matchAll(/<path ([^>]*?)\/>/g)].map((m) => {
    const a = attrs(m[1]);
    const t = /translate\((-?[\d.]+) 0\)/.exec(a.transform ?? '');
    return { fill: a.fill, x: t ? Number(t[1]) : 0, d: a.d };
  });
}

// opentype.js output for a text, as the plan specifies it: Plex Sans woff, GPOS kerning,
// tracking between the letters, coordinates rounded to 2 places.
const font = (name) => {
  const buf = read(`node_modules/@ibm/plex-sans/fonts/complete/woff/${name}.woff`);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const SEMI = font('IBMPlexSans-SemiBold');
const REGULAR = font('IBMPlexSans-Regular');
function opentypeText(f, text, trackingUnits) {
  const p = f.getPath(text, 0, 0, 100, { kerning: true, tracking: trackingUnits });
  const r2 = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; };
  for (const c of p.commands) for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2']) if (k in c) c[k] = r2(c[k]);
  const bb = p.getBoundingBox();
  return { d: p.toPathData({ decimalPlaces: 2, flipY: false, optimize: true }), box: [bb.x1, bb.y1, bb.x2, bb.y2] };
}

// ---------------------------------------------------------------- pixels
const px = (img, x, y) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function diff(a, b) {
  assert.deepEqual([a.width, a.height], [b.width, b.height]);
  let max = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d) n++;
    max = Math.max(max, d);
  }
  return { max, n, total: a.data.length };
}
const rendered = (svg, w) => decodeRGBA(render(svg, w).png);

// ---------------------------------------------------------------- L1 geometry
test('L1: logo-geometry.json holds the decided primitives and the derived chevron outline to 1e-4', () => {
  for (const k of ['tile', 'bar', 'tongue']) assert.deepEqual(geo[k], DECIDED[k], k);
  assert.equal(geo.grid, 32);
  assert.equal(geo.chevron.vertices.length, OUTLINE.length);
  geo.chevron.vertices.forEach((v, i) => {
    assert.ok(Math.abs(v[0] - OUTLINE[i][0]) <= 1e-4 && Math.abs(v[1] - OUTLINE[i][1]) <= 1e-4, `vertex ${i}: ${v} vs ${OUTLINE[i]}`);
  });
  assert.equal(geo.chevron.d, 'M23.0794 5.3995 L14.2457 16 L23.0794 26.6005 L26.9206 23.3995 L20.7543 16 L26.9206 8.6005 Z');
  // The SVG miter ratio 1 / sin(half the angle) stays below the default miter limit 4 (review N6).
  assert.ok(Math.abs(geo.chevron.miterRatio - 1 / Math.sin(Math.atan2(9, 7.5))) < 1e-3, `miter ratio ${geo.chevron.miterRatio}`);
  assert.deepEqual(geo.markBox, [7, 5.3995, 26.9206, 26.6005]);
  assert.equal(geo.markViewBox, '5 5 22 22');
});

test('L1: logo-geometry.json is what scripts/build_logo.mjs derives from theme/brand.json now', () => {
  const now = markGeometry(brand.logo);
  for (const k of Object.keys(now)) assert.deepEqual(geo[k], now[k], `${k}: run npm run build:all`);
});

test('L1: every file with the mark carries exactly the geometry shapes', () => {
  const rect = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v]));
  const markOf = (svg) => shapes(svg).filter((s) => s.tag === 'rect' || s.d === geo.chevron.d);
  const files = [...BRAND_SVGS.filter((f) => !f.startsWith('keepia-wordmark')), ...LOCKUPS.map((l) => l.file)];
  for (const f of new Set(files)) {
    const s = markOf(brandFile(f));
    const own = s.slice(-3);
    assert.deepEqual(num(own[0]), { x: 7, y: 7, width: 5, height: 18, rx: 1 }, `${f}: bar`);
    assert.deepEqual(num(own[1]), { x: 14, y: 14.25, width: 4, height: 3.5 }, `${f}: tongue`);
    assert.equal(own[2].d, geo.chevron.d, `${f}: chevron`);
    if (s.length === 4) {
      const tile = num(s[0]);
      const full = ['icon-maskable.svg', 'apple-touch-icon.svg'].includes(f);
      if (f === 'icon-maskable.svg') assert.deepEqual(tile, { width: 512, height: 512 }, f);
      else assert.deepEqual(tile, full ? { width: 32, height: 32 } : rect({ width: 32, height: 32, rx: 7 }), `${f}: tile`);
    }
  }
  assert.equal(brandFile('favicon.svg'), brandFile('keepia-mark.svg'), 'favicon.svg is keepia-mark.svg');
});

// ---------------------------------------------------------------- L2 pixel equivalence
test('L2: the filled outline renders like the stroke reference: identical at 16 and 32 px, edge noise only at 512 px', () => {
  const mark = brandFile('keepia-mark.svg');
  for (const s of [16, 32]) {
    const d = diff(rendered(mark, s), rendered(REFERENCE, s));
    assert.equal(d.n, 0, `${s} px: ${d.n} channel values differ (max ${d.max})`);
  }
  const d = diff(rendered(mark, 512), rendered(REFERENCE, 512));
  assert.ok(d.max <= 32, `512 px: max channel difference ${d.max}`);
  assert.ok(d.n / d.total <= 0.001, `512 px: ${d.n} of ${d.total} channel values differ`);
});

// ---------------------------------------------------------------- L3 16 px
test('L3: at 16 px the gap between bar and tongue is the tile colour, bar and tongue are white', () => {
  const img = decodeRGBA(read(`${B}/favicon-16.png`));
  assert.deepEqual([img.width, img.height], [16, 16]);
  for (const [x, y] of [[6, 7], [6, 8]]) assert.deepEqual(px(img, x, y), [...rgb(TEAL60), 255], `(${x},${y}) is the tile`);
  for (const [x, y] of [[4, 8], [5, 8], [8, 8]]) assert.deepEqual(px(img, x, y), [255, 255, 255, 255], `(${x},${y}) is white`);
});

// ---------------------------------------------------------------- L4 hygiene and colours
test('L4: brand/ holds exactly the generated SVGs, PNGs, favicon.ico and manifest.json', () => {
  const want = [...BRAND_SVGS, ...SHEETS, ...Object.keys(PNGS), ...SHEETS.map((f) => f.replace('.svg', '.png')), 'favicon.ico', 'manifest.json'];
  assert.deepEqual(readdirSync(path.join(ROOT, B)).sort(), [...new Set(want)].sort());
});

test('L4: SVG hygiene: viewBox, title and role; no text, style, script, links, strokes, gradients, filters or images', () => {
  for (const f of [...new Set(BRAND_SVGS), ...SHEETS]) {
    const svg = brandFile(f);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[^"]+" role="img">\n<title>[^<]+<\/title>\n/, `${f}: root, viewBox, role, title`);
    for (const bad of ['<text', '<style', 'style=', '<script', 'href', '<a ', '<image', '<foreignObject', 'url(', 'stroke', 'gradient', '<filter', 'filter=', 'shadow', 'font', 'opacity="0"']) {
      assert.ok(!svg.toLowerCase().includes(bad.toLowerCase()), `${f} contains ${bad}`);
    }
  }
});

test('L4: each variant uses only its colours from theme/tokens.json (one colour in black and white)', () => {
  const L = tokens.light;
  const D = tokens.dark;
  const set = (...c) => [...new Set(c)].sort();
  const want = {
    light: set(L['background-brand'], L['text-on-color'], L['text-primary'], L['text-secondary']),
    dark: set(D['background-brand'], D['text-on-color'], D['text-primary'], D['text-secondary']),
    black: ['#000000'], white: ['#ffffff'],
  };
  for (const l of LOCKUPS) {
    const c = [...colours(brandFile(l.file))].sort();
    // Without a product name the family lockup has no text-secondary.
    const mono = l.variant === 'black' || l.variant === 'white';
    const expected = l.product || mono ? want[l.variant] : want[l.variant].filter((x) => x !== tokens[l.variant]['text-secondary']);
    assert.deepEqual(c, expected, `${l.file}: colours`);
  }
  for (const v of VARIANTS) {
    const ink = v === 'black' ? '#000000' : v === 'white' ? '#ffffff' : tokens[v]['text-primary'];
    assert.deepEqual([...colours(brandFile(`keepia-wordmark-${v}.svg`))], [ink], `wordmark ${v}`);
  }
  assert.deepEqual([...colours(brandFile('keepia-mark-teal.svg'))], [L['background-brand']]);
  assert.deepEqual([...colours(brandFile('keepia-mark-black.svg'))], ['#000000']);
  assert.deepEqual([...colours(brandFile('keepia-mark-white.svg'))], ['#ffffff']);
  for (const f of ['keepia-mark.svg', 'icon-maskable.svg', 'apple-touch-icon.svg']) {
    assert.deepEqual([...colours(brandFile(f))].sort(), set(L['background-brand'], L['text-on-color']), f);
  }
  // The tile is Teal 60 in both themes (decision 6807193549, item 3).
  assert.equal(L['background-brand'], TEAL60);
  assert.equal(D['background-brand'], TEAL60);
});

test('L4: the sign-off sheets use only token colours of their theme and the single colours, apart from the favicon rasters', () => {
  const themeOf = { 'preview-white.svg': 'light', 'preview-g100.svg': 'dark', 'preview-icons.svg': 'light' };
  for (const [f, theme] of Object.entries(themeOf)) {
    const svg = brandFile(f).replace(/<g data-raster="\d+">[\s\S]*?<\/g>/g, '');
    const allowed = new Set([...Object.values(tokens[theme]), '#000000', '#ffffff'].map((v) => v.toLowerCase()));
    for (const c of colours(svg)) assert.ok(allowed.has(c), `${f}: ${c} is not a ${theme} token colour`);
  }
});

// ---------------------------------------------------------------- L5 wordmark
test('L5: the wordmark is opentype.js output for keepia in Plex Sans SemiBold, kerning on, tracking -10 units', () => {
  assert.equal(SEMI.unitsPerEm, 1000);
  assert.equal(SEMI.tables.os2.sCapHeight, 698);
  const [k, e] = SEMI.stringToGlyphs('ke');
  assert.equal(k.advanceWidth, 562);
  assert.equal(SEMI.getKerningValue(k, e), -24);
  assert.equal(geo.text.tracking, -10);
  assert.equal(geo.text.wordmark.d, opentypeText(SEMI, 'keepia', -10).d);
  // The pen moves from k to e by (562 - 24 - 10) units, at font size 100.
  assert.equal(geo.text.wordmark.pens[1], (562 - 24 - 10) / 10);
  for (const v of VARIANTS) assert.equal(textPaths(brandFile(`keepia-wordmark-${v}.svg`))[0].d, geo.text.wordmark.d, `wordmark ${v}`);
  // Every number in the path is well formed (no "50.300"-style merged values).
  assert.doesNotMatch(geo.text.wordmark.d, /\d+\.\d+\.\d/);
});

// ---------------------------------------------------------------- L6 lockups
test('L6: lockups: tile 1.15 and gaps 0.4 x the font size, tile centred on the cap height, tight viewBox', () => {
  const F = 100;
  const cap = 69.8;
  const word = opentypeText(SEMI, 'keepia', -10);
  const advance = geo.text.wordmark.advance;
  for (const l of LOCKUPS) {
    const svg = brandFile(l.file);
    const g = markGroup(svg);
    const texts = textPaths(svg);
    const name = l.product ? opentypeText(REGULAR, l.product, 0) : null;
    const mono = l.variant === 'black' || l.variant === 'white';
    assert.equal(texts.length, l.product ? 2 : 1, `${l.file}: text paths`);
    assert.equal(texts[0].d, word.d, `${l.file}: wordmark`);
    if (name) assert.equal(texts[1].d, name.d, `${l.file}: product name in Plex Sans Regular`);
    let boxes;
    if (l.kind === 'horizontal') {
      assert.ok(Math.abs(g.k * 32 - 1.15 * F) < 1e-6, `${l.file}: tile ${g.k * 32}`);
      assert.equal(g.x, 0);
      assert.ok(Math.abs(g.y + (g.k * 32) / 2 - -cap / 2) <= 0.5, `${l.file}: tile centre ${g.y + g.k * 16} vs cap centre ${-cap / 2}`);
      assert.ok(Math.abs(texts[0].x - (g.k * 32 + 0.4 * F)) < 1e-6, `${l.file}: gap to the wordmark`);
      if (name) assert.ok(Math.abs(texts[1].x - (texts[0].x + advance + 0.4 * F)) < 1e-6, `${l.file}: gap to the product name`);
    } else {
      assert.ok(Math.abs(g.k * 32 - 2.3 * F) < 1e-6, `${l.file}: stacked tile ${g.k * 32}`);
      assert.ok(Math.abs(g.y + g.k * 32 - (-cap - 0.4 * F)) < 1e-4, `${l.file}: gap between tile and cap height`);
      assert.equal(texts[0].x, 0);
      if (name) assert.ok(Math.abs(texts[1].x - (advance + 0.4 * F)) < 1e-6, `${l.file}: gap to the product name`);
      const ink = [word.box[0], name ? texts[1].x + name.box[2] : word.box[2]];
      assert.ok(Math.abs(g.x + g.k * 16 - (ink[0] + ink[1]) / 2) < 1e-3, `${l.file}: tile centred over the text`);
    }
    const markBox = mono ? geo.markBox : [0, 0, 32, 32];
    boxes = [
      [g.x + markBox[0] * g.k, g.y + markBox[1] * g.k, g.x + markBox[2] * g.k, g.y + markBox[3] * g.k],
      [texts[0].x + word.box[0], word.box[1], texts[0].x + word.box[2], word.box[3]],
      ...(name ? [[texts[1].x + name.box[0], name.box[1], texts[1].x + name.box[2], name.box[3]]] : []),
    ];
    const ink = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    const [x, y, w, h] = viewBox(svg);
    for (const [got, want, what] of [[x, ink[0], 'left'], [y, ink[1], 'top'], [x + w, ink[2], 'right'], [y + h, ink[3], 'bottom']]) {
      assert.ok(Math.abs(got - want) <= 0.01 + 1e-9, `${l.file}: viewBox ${what} ${got} vs ink ${want}`);
    }
    // Colours: name in text-secondary, wordmark in text-primary; single colour uses one fill.
    if (mono) {
      assert.equal(new Set(shapes(svg).map((s) => s.fill)).size, 1, `${l.file}: one fill`);
    } else {
      assert.equal(texts[0].fill, tokens[l.variant]['text-primary'], `${l.file}: wordmark colour`);
      if (name) assert.equal(texts[1].fill, tokens[l.variant]['text-secondary'], `${l.file}: product name colour`);
    }
  }
});

// ---------------------------------------------------------------- L7 freshness
test('L7: the manifest lists exactly the expected PNGs, each rendered from its current SVG', () => {
  const sheets = Object.fromEntries(SHEETS.map((f) => [f.replace('.svg', '.png'), [viewBox(brandFile(f))[2], Math.round(viewBox(brandFile(f))[3]), f]]));
  const want = { ...PNGS, ...sheets };
  const listed = Object.fromEntries(manifest.pngs.map((e) => [e.path, [e.width, e.height, e.source]]));
  assert.deepEqual(listed, Object.fromEntries(Object.entries(want).map(([p, [w, h, s]]) => [`${B}/${p}`, [w, h, `${B}/${s}`]])));
  assert.equal(manifest.renderer, '@resvg/resvg-js 2.6.2');
  for (const e of manifest.pngs) {
    assert.ok(existsSync(path.join(ROOT, e.path)), `missing: ${e.path}`);
    const png = read(e.path);
    const h = ihdr(png);
    assert.deepEqual([h.width, h.height], [e.width, e.height], `${e.path}: IHDR size`);
    const svgSha = sha256(read(e.source));
    assert.equal(textChunks(png)['keepia:source-sha256'], svgSha, `${e.path} is stale: run npm run build:all`);
    assert.equal(e.sourceSha256, svgSha, `${e.path}: manifest source sha256`);
    assert.equal(sha256(png), e.sha256, `${e.path}: manifest sha256`);
  }
});

// ---------------------------------------------------------------- L8 ICO
test('L8: favicon.ico holds the 16, 32 and 48 px PNGs byte for byte', () => {
  const ico = read(`${B}/favicon.ico`);
  const entries = readIco(ico);
  assert.deepEqual(entries.map((e) => [e.width, e.height, e.bpp]), [[16, 16, 32], [32, 32, 32], [48, 48, 32]]);
  for (const e of entries) assert.ok(e.png.equals(read(`${B}/favicon-${e.width}.png`)), `${e.width} px payload`);
  assert.equal(manifest.ico.sha256, sha256(ico));
});

// ---------------------------------------------------------------- L9 icons
test('L9: maskable icon: the mark lies inside the safe circle (r 204.8), the corners are opaque Teal', () => {
  const { width, height, data } = decodeRGBA(read(`${B}/icon-maskable-512.png`));
  assert.deepEqual([width, height], [512, 512]);
  const t = rgb(TEAL60);
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] === t[0] && data[i + 1] === t[1] && data[i + 2] === t[2] && data[i + 3] === 255) continue;
      n++;
      const r = Math.hypot(x + 0.5 - 256, y + 0.5 - 256);
      assert.ok(r <= 204.8, `pixel (${x}, ${y}) at radius ${r.toFixed(1)} is outside the safe circle`);
    }
  }
  assert.ok(n > 10000, `the mark is missing (${n} pixels)`);
  const img = { width, height, data };
  for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) assert.deepEqual(px(img, x, y), [...t, 255], `corner (${x},${y})`);
});

test('L9: apple-touch-icon.png (180) and icon-1024.png are opaque; the web icons are transparent outside the tile', () => {
  for (const [f, s] of [['apple-touch-icon.png', 180], ['icon-1024.png', 1024]]) {
    const img = decodeRGBA(read(`${B}/${f}`));
    assert.deepEqual([img.width, img.height], [s, s]);
    for (let i = 3; i < img.data.length; i += 4) assert.equal(img.data[i], 255, `${f}: alpha below 255 at pixel ${(i - 3) / 4}`);
  }
  for (const f of ['icon-192.png', 'icon-512.png', 'favicon-32.png']) {
    const img = decodeRGBA(read(`${B}/${f}`));
    assert.equal(px(img, 0, 0)[3], 0, `${f}: corner transparent`);
    assert.deepEqual(px(img, img.width >> 1, 1), [...rgb(TEAL60), 255], `${f}: tile edge`);
  }
});

// ---------------------------------------------------------------- L10 single source
test('L10: no script other than build_logo.mjs spells out the geometry, and none spells out a brand colour', () => {
  const scripts = readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  for (const f of ['build_logo.mjs', 'build_previews.mjs', 'render_pngs.mjs', 'png.mjs']) assert.ok(scripts.includes(f), `${f} is scanned`);
  const numbers = ['14.2457', '20.7543', '23.0794', '26.9206', '5.3995', '8.6005', '23.3995', '26.6005', '17.5', '14.25', '17.75', '15.5', '1.15', '2.3'];
  const hexes = [TEAL60, ...['light', 'dark'].flatMap((t) => [tokens[t]['text-primary'], tokens[t]['text-secondary']])];
  for (const f of scripts) {
    const text = readText(`scripts/${f}`).toLowerCase();
    for (const h of hexes) assert.ok(!text.includes(h), `scripts/${f} carries the colour ${h}`);
    if (['build_logo.mjs', 'build_previews.mjs', 'render_pngs.mjs', 'png.mjs'].includes(f)) {
      for (const n of numbers) assert.doesNotMatch(text, new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d])`), `scripts/${f} carries ${n}`);
    }
  }
});

// ---------------------------------------------------------------- L11 logo contrast
test('L11: logo contrast: white mark on the tile 4.99, Teal mark 4.99 on White and 3.63 on G100, the tile on its allowed grounds', () => {
  const r = (a, b) => Math.round(ratio(a, b) * 100) / 100;
  for (const t of ['light', 'dark']) {
    const T = tokens[t];
    assert.ok(ratio(T['text-on-color'], T['background-brand']) >= 4.5, `${t}: mark on tile`);
    assert.ok(ratio(T['background-brand'], T.background) >= 3, `${t}: Teal mark / tile on background`);
    assert.ok(ratio(T['background-brand'], T['layer-01']) >= 3, `${t}: tile on layer-01`);
  }
  assert.equal(r(tokens.light['text-on-color'], tokens.light['background-brand']), 4.99);
  assert.equal(r(tokens.light['background-brand'], tokens.light.background), 4.99);
  assert.equal(r(tokens.dark['background-brand'], tokens.dark.background), 3.63);
  // G100 layer-02 is excluded by the usage rule (no tile there, README "Logo").
  assert.ok(ratio(tokens.dark['background-brand'], tokens.dark['layer-02']) < 3);
  assert.ok(ratio(tokens.dark['text-on-color'], tokens.dark['layer-02']) >= 3, 'the white mark on layer-02');
});

// ---------------------------------------------------------------- sheets
test('the sign-off sheets draw the favicon rasters pixel for pixel as favicon-16/32/48.png', () => {
  const groups = (svg) => [...svg.matchAll(/<g data-raster="(\d+)">\n([\s\S]*?)\n<\/g>/g)].map((m) => ({ size: Number(m[1]), rects: m[2].split('\n').map(attrs) }));
  let checked = 0;
  for (const f of SHEETS) {
    for (const g of groups(brandFile(f))) {
      const img = decodeRGBA(read(`${B}/favicon-${g.size}.png`));
      const k = Number(g.rects[0].width);
      const x0 = Math.min(...g.rects.map((r) => Number(r.x)));
      const y0 = Math.min(...g.rects.map((r) => Number(r.y)));
      assert.ok(Number.isInteger(x0) && Number.isInteger(y0), `${f}: raster on whole pixels`);
      const drawn = new Map(g.rects.map((r) => [`${(Number(r.x) - x0) / k},${(Number(r.y) - y0) / k}`, r]));
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const [R, G, Bl, A] = px(img, x, y);
          const r = drawn.get(`${x},${y}`);
          if (A === 0) { assert.equal(r, undefined, `${f}: (${x},${y}) is transparent`); continue; }
          assert.ok(r, `${f}: pixel (${x},${y}) of the ${g.size} px favicon is missing`);
          assert.equal(r.fill, `#${[R, G, Bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
          assert.ok(Math.abs(Number(r['fill-opacity'] ?? 1) - A / 255) < 1e-4);
        }
      }
      checked++;
    }
  }
  assert.ok(checked >= 6, `${checked} rasters`);
  // N3: the G100 sheet shows no tile on layer-02.
  const g100 = brandFile('preview-g100.svg');
  const tail = g100.slice(g100.lastIndexOf(`fill="${tokens.dark['layer-02']}" x="0"`));
  assert.ok(tail.length > 0 && !tail.includes(TEAL60), 'no tile on G100 layer-02');
});
