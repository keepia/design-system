// Builds the Keepia logo from its one source (keepia/mail#7, part 3):
//   theme/logo-geometry.json   the mark's primitives and the filled chevron outline derived from
//                              theme/brand.json, the outlined wordmark and product names, and the
//                              lockup layout
//   brand/*.svg                the mark, monochrome marks, wordmarks, lockups (horizontal and
//                              stacked, family and products), favicon.svg and the app icon sources
// Run: npm run build:all (README, "Building"), which runs this script after scripts/build.mjs
// (the colours come from theme/tokens.json) and before scripts/build_previews.mjs and
// scripts/render_pngs.mjs, which read the files written here.
//
// The geometry is the maintainer's decision on keepia/mail#7 (comment 6807193549, mark R3) and
// lives in theme/brand.json only. The chevron is a stroke there (miter join, butt caps); the
// files carry it as one filled polygon computed here, because the brand files have no strokes.
// The wordmark `keepia` and the product names are outlined from IBM Plex Sans with opentype.js
// (kerning on, tracking from brand.json), so no file needs a font.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import opentype from 'opentype.js';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const P = (...p) => path.join(ROOT, ...p);
export const BRAND_DIR = 'brand';
export const GEOMETRY = 'theme/logo-geometry.json';
export const VARIANTS = ['light', 'dark', 'black', 'white'];

// Numbers as written into the files: rounded, without trailing zeros and without "-0".
export function fmt(n, places = 4) {
  const r = Number(n.toFixed(places));
  return String(Object.is(r, -0) ? 0 : r);
}

// ---------------------------------------------------------------- the mark
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const unit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
const along = (p, v, t) => [p[0] + v[0] * t, p[1] + v[1] * t];

// The point where the lines p + t·d and q + u·e meet.
function intersect(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-12) throw new Error('the chevron segments are parallel');
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return along(p, d, t);
}

// The outline of a two-segment polyline stroked with a miter join and butt caps, as the
// vertices of one polygon: the cap corner at the start on the left side, the outer miter tip,
// both end cap corners, the inner joint, the other start cap corner. Throws when the join would
// fall back to a bevel (miter ratio above the limit), because the decided mark has a miter.
export function strokeOutline({ points: [a, b, c], width, join, cap, miterLimit }) {
  if (join !== 'miter' || cap !== 'butt') throw new Error(`chevron: only a miter join with butt caps is supported, got ${join}/${cap}`);
  const h = width / 2;
  const d1 = unit(sub(b, a));
  const d2 = unit(sub(c, b));
  const n1 = [-d1[1], d1[0]];
  const n2 = [-d2[1], d2[0]];
  const side = (s) => ({
    start: along(a, n1, s * h),
    joint: intersect(along(a, n1, s * h), d1, along(b, n2, s * h), d2),
    end: along(c, n2, s * h),
  });
  const L = side(1);
  const R = side(-1);
  const ratio = Math.hypot(...sub(L.joint, R.joint)) / width;
  if (ratio > miterLimit) throw new Error(`chevron: miter ratio ${ratio.toFixed(3)} exceeds the limit ${miterLimit}`);
  return { vertices: [L.start, L.joint, L.end, R.end, R.joint, R.start], miterRatio: ratio };
}

const round = (p) => p.map((v) => Number(fmt(v)));
export const polygonPath = (vs) => `M${vs.map((v) => v.map((x) => fmt(x)).join(' ')).join(' L')} Z`;

export function markGeometry(logo) {
  const { grid, tile, bar, tongue, chevron, markViewBox, clearSpace, maskable } = logo;
  const { vertices, miterRatio } = strokeOutline(chevron);
  const vs = vertices.map(round);
  const rect = (r) => ({ x: r.x[0], y: r.y[0], width: r.x[1] - r.x[0], height: r.y[1] - r.y[0], ...(r.radius ? { rx: r.radius } : {}) });
  const xs = [bar.x[0], bar.x[1], tongue.x[0], tongue.x[1], ...vs.map((v) => v[0])];
  const ys = [bar.y[0], bar.y[1], tongue.y[0], tongue.y[1], ...vs.map((v) => v[1])];
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  // Clear space: one bar width of free space around the logo (decision 6807193549, item 3).
  if (bar.x[1] - bar.x[0] !== clearSpace) throw new Error('brand.json: clearSpace must be the bar width');
  // The maskable icon: the mark around the tile centre at unitPx per grid unit must stay inside the
  // safe circle (radius safeRadius × size).
  const centre = grid / 2;
  const corners = [[bar.x[0], bar.y[0]], [bar.x[0], bar.y[1]], [bar.x[1], bar.y[0]], [bar.x[1], bar.y[1]], ...vs];
  const farthest = Math.max(...corners.map(([x, y]) => Math.hypot(x - centre, y - centre)));
  const safe = maskable.safeRadius * maskable.size;
  if (farthest * maskable.unitPx > safe) throw new Error(`maskable: the mark reaches ${farthest * maskable.unitPx} px, outside r ${safe}`);
  return {
    grid,
    tile: { x: 0, y: 0, width: grid, height: grid, rx: tile.radius },
    bar: rect(bar),
    tongue: rect(tongue),
    chevron: { vertices: vs, d: polygonPath(vs), miterRatio: Number(fmt(miterRatio)) },
    markBox: box.map((v) => Number(fmt(v))),
    markViewBox: markViewBox.join(' '),
    clearSpace,
    maskable: { ...maskable, farthest: Number(fmt(farthest)), reachPx: Number(fmt(farthest * maskable.unitPx, 2)), safeRadiusPx: safe },
  };
}

// ---------------------------------------------------------------- text
export const loadFont = (name) => {
  const buf = fs.readFileSync(P('node_modules/@ibm/plex-sans/fonts/complete/woff', `${name}.woff`));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

// `text` outlined at `size` with the baseline at y 0 and the pen at x 0: opentype.js's path with
// GPOS kerning and `tracking` (in em) between the letters, the pen position of every glyph, the
// advance (the pen after the last glyph, without trailing tracking) and the ink box.
export function outline(font, text, size, tracking = 0) {
  const trackUnits = tracking * font.unitsPerEm;
  const options = { kerning: true, tracking: trackUnits };
  const p = font.getPath(text, 0, 0, size, options);
  // Round every coordinate to 2 places before opentype.js writes the path: its writer drops the
  // separator before a negative value that rounds to 0 ("50.3" + "0" becomes "50.30").
  const r2 = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; };
  for (const cmd of p.commands) for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2']) if (k in cmd) cmd[k] = r2(cmd[k]);
  const pens = [];
  const end = font.forEachGlyph(text, 0, 0, size, options, (g, x) => pens.push(x));
  const bb = p.getBoundingBox();
  return {
    d: p.toPathData({ decimalPlaces: 2, flipY: false, optimize: true }),
    pens: pens.map((x) => Number(fmt(x))),
    advance: Number(fmt(end - (trackUnits * size) / font.unitsPerEm)),
    box: [bb.x1, bb.y1, bb.x2, bb.y2].map((v) => Number(fmt(v, 2))),
  };
}

export function textGeometry(logo) {
  const semi = loadFont(logo.wordmark.font);
  const regular = loadFont(logo.productName.font);
  const size = logo.lockup.fontSize;
  return {
    font: logo.wordmark.font,
    productFont: logo.productName.font,
    unitsPerEm: semi.unitsPerEm,
    capHeight: semi.tables.os2.sCapHeight,
    fontSize: size,
    tracking: logo.wordmark.tracking * semi.unitsPerEm,
    wordmark: { text: logo.wordmark.text, ...outline(semi, logo.wordmark.text, size, logo.wordmark.tracking) },
    products: Object.fromEntries(logo.products.map((name) => [name, { text: name, ...outline(regular, name, size) }])),
  };
}

// ---------------------------------------------------------------- lockups
const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
];
const shift = (b, dx, dy = 0) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
const scaleBox = (b, k, dx, dy) => [b[0] * k + dx, b[1] * k + dy, b[2] * k + dx, b[3] * k + dy];
// A viewBox that holds the box, rounded outwards to 2 places.
const viewBoxOf = (b) => {
  const x0 = Math.floor(b[0] * 100) / 100;
  const y0 = Math.floor(b[1] * 100) / 100;
  const x1 = Math.ceil(b[2] * 100) / 100;
  const y1 = Math.ceil(b[3] * 100) / 100;
  return [x0, y0, x1 - x0, y1 - y0].map((v) => fmt(v, 2)).join(' ');
};

// The layout at font size `fontSize` (baseline y 0, wordmark pen at x 0 for stacked lockups):
// the tile is markScale × the font size, centred vertically on the cap height, with a gap of
// gap × the font size to the wordmark and another to the product name. Stacked: the tile is
// stackedMarkScale × the font size, centred above the text line's ink, one gap above the cap
// height. `ink` is the box of what is drawn: the tile, or the bare mark in single colour.
export function lockupLayout(mark, text, lockup, product) {
  const F = text.fontSize;
  const cap = (text.capHeight / text.unitsPerEm) * F;
  const gap = lockup.gap * F;
  const word = text.wordmark;
  const name = product ? text.products[product] : null;
  const markBox = mark.markBox;
  const tileBox = [0, 0, mark.grid, mark.grid];

  const hSize = lockup.markScale * F;
  const hk = hSize / mark.grid;
  const hTile = { x: 0, y: -cap / 2 - hSize / 2, size: hSize, scale: hk };
  const hWord = hSize + gap;
  const hName = name ? hWord + word.advance + gap : null;
  const hText = [shift(word.box, hWord), ...(name ? [shift(name.box, hName)] : [])];

  const lineInk = union([word.box, ...(name ? [shift(name.box, word.advance + gap)] : [])]);
  const sSize = lockup.stackedMarkScale * F;
  const sk = sSize / mark.grid;
  const sTile = { x: (lineInk[0] + lineInk[2]) / 2 - sSize / 2, y: -cap - gap - sSize, size: sSize, scale: sk };
  const sName = name ? word.advance + gap : null;
  const sText = [word.box, ...(name ? [shift(name.box, sName)] : [])];

  const view = (t, texts, box) => viewBoxOf(union([scaleBox(box, t.scale, t.x, t.y), ...texts]));
  const r = (t) => ({ x: Number(fmt(t.x)), y: Number(fmt(t.y)), size: Number(fmt(t.size)), scale: Number(fmt(t.scale, 6)) });
  return {
    horizontal: { tile: r(hTile), wordX: Number(fmt(hWord)), nameX: name ? Number(fmt(hName)) : null, viewBox: { tile: view(hTile, hText, tileBox), mark: view(hTile, hText, markBox) } },
    stacked: { tile: r(sTile), wordX: 0, nameX: name ? Number(fmt(sName)) : null, viewBox: { tile: view(sTile, sText, tileBox), mark: view(sTile, sText, markBox) } },
  };
}

// ---------------------------------------------------------------- SVG
export const svgDoc = (viewBox, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">\n<title>${title}</title>\n${body.join('\n')}\n</svg>\n`;

// The mark's shapes on the 32-unit grid; `tile` is the tile colour (null: no tile), `full` draws
// the tile full-bleed (no corner radius) for the Apple and maskable icons.
export function markShapes(mark, { tile = null, ink, full = false }) {
  const t = mark.tile;
  const b = mark.bar;
  const g = mark.tongue;
  return [
    ...(tile ? [`<rect fill="${tile}" width="${fmt(t.width)}" height="${fmt(t.height)}"${full ? '' : ` rx="${fmt(t.rx)}"`}/>`] : []),
    `<rect fill="${ink}" x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.width)}" height="${fmt(b.height)}" rx="${fmt(b.rx)}"/>`,
    `<rect fill="${ink}" x="${fmt(g.x)}" y="${fmt(g.y)}" width="${fmt(g.width)}" height="${fmt(g.height)}"/>`,
    `<path fill="${ink}" d="${mark.chevron.d}"/>`,
  ];
}

const group = (t, shapes) => [`<g transform="translate(${fmt(t.x)} ${fmt(t.y)}) scale(${fmt(t.scale, 6)})">`, ...shapes, '</g>'];
const textPath = (fill, x, d) => `<path fill="${fill}"${x ? ` transform="translate(${fmt(x)} 0)"` : ''} d="${d}"/>`;

// The colours of each variant: light and dark from theme/tokens.json (tile `background-brand`,
// mark `text-on-color`, wordmark `text-primary`, product name `text-secondary`); black and white
// one colour from brand.json, with the bare mark instead of the tile.
export function palette(tokens, logo) {
  const of = (t) => ({ tile: t['background-brand'], mark: t['text-on-color'], ink: t['text-primary'], name: t['text-secondary'] });
  const mono = (c) => ({ tile: null, mark: c, ink: c, name: c });
  return { light: of(tokens.light), dark: of(tokens.dark), black: mono(logo.monochrome.black), white: mono(logo.monochrome.white) };
}

const title = (product) => (product ? `Keepia ${product[0].toUpperCase()}${product.slice(1)}` : 'Keepia');

export function lockupSvg(mark, text, layout, colours, product, kind) {
  const L = layout[kind];
  const word = text.wordmark;
  const shapes = colours.tile ? markShapes(mark, { tile: colours.tile, ink: colours.mark }) : markShapes(mark, { ink: colours.mark });
  const body = [
    ...group(L.tile, shapes),
    textPath(colours.ink, L.wordX, word.d),
    ...(product ? [textPath(colours.name, L.nameX, text.products[product].d)] : []),
  ];
  return svgDoc(colours.tile ? L.viewBox.tile : L.viewBox.mark, title(product), body);
}

// Every brand SVG: file name → contents.
export function brandSvgs(mark, text, layouts, colours, logo) {
  const out = {};
  const light = colours.light;
  out['keepia-mark.svg'] = svgDoc(`0 0 ${mark.grid} ${mark.grid}`, 'Keepia', markShapes(mark, { tile: light.tile, ink: light.mark }));
  out['favicon.svg'] = out['keepia-mark.svg'];
  for (const [v, c] of [['teal', light.tile], ['black', colours.black.mark], ['white', colours.white.mark]]) {
    out[`keepia-mark-${v}.svg`] = svgDoc(mark.markViewBox, 'Keepia', markShapes(mark, { ink: c }));
  }
  for (const v of VARIANTS) {
    out[`keepia-wordmark-${v}.svg`] = svgDoc(viewBoxOf(text.wordmark.box), 'Keepia', [textPath(colours[v].ink, 0, text.wordmark.d)]);
    for (const product of [null, ...logo.products]) {
      const stem = product ? `keepia-${product}-lockup` : 'keepia-lockup';
      const layout = layouts[product ?? 'keepia'];
      out[`${stem}-${v}.svg`] = lockupSvg(mark, text, layout, colours[v], product, 'horizontal');
      out[`${stem}-stacked-${v}.svg`] = lockupSvg(mark, text, layout, colours[v], product, 'stacked');
    }
  }
  // App icon sources: full-bleed squares. The maskable icon draws the mark at unitPx per grid unit
  // around the centre, inside the safe circle; the Apple icon is the tile without its radius
  // (iOS and macOS round it).
  const m = mark.maskable;
  const off = m.size / 2 - (mark.grid / 2) * m.unitPx;
  out['icon-maskable.svg'] = svgDoc(`0 0 ${m.size} ${m.size}`, 'Keepia', [
    `<rect fill="${light.tile}" width="${m.size}" height="${m.size}"/>`,
    ...group({ x: off, y: off, scale: m.unitPx }, markShapes(mark, { ink: light.mark })),
  ]);
  out['apple-touch-icon.svg'] = svgDoc(`0 0 ${mark.grid} ${mark.grid}`, 'Keepia', markShapes(mark, { tile: light.tile, ink: light.mark, full: true }));
  return out;
}

export function build() {
  const brand = JSON.parse(fs.readFileSync(P('theme/brand.json'), 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(P('theme/tokens.json'), 'utf8'));
  const logo = brand.logo;
  const mark = markGeometry(logo);
  const text = textGeometry(logo);
  const layouts = Object.fromEntries([null, ...logo.products].map((p) => [p ?? 'keepia', lockupLayout(mark, text, logo.lockup, p)]));
  const geometry = { source: 'theme/brand.json', generator: 'scripts/build_logo.mjs', ...mark, text, lockups: layouts };
  fs.writeFileSync(P(GEOMETRY), `${JSON.stringify(geometry, null, 1)}\n`);
  const svgs = brandSvgs(mark, text, layouts, palette(tokens, logo), logo);
  fs.mkdirSync(P(BRAND_DIR), { recursive: true });
  // Remove SVGs of this step that are no longer generated; the previews are the next step's.
  for (const f of fs.readdirSync(P(BRAND_DIR))) {
    if (f.endsWith('.svg') && !f.startsWith('preview-') && !Object.hasOwn(svgs, f)) fs.rmSync(P(BRAND_DIR, f));
  }
  for (const [f, s] of Object.entries(svgs)) fs.writeFileSync(P(BRAND_DIR, f), s);
  console.log(`build_logo: ${GEOMETRY}, ${Object.keys(svgs).length} SVGs in ${BRAND_DIR}/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
