// Builds the sign-off sheets of the logo (keepia/mail#7, part 3; maintainer decision M6):
//   brand/preview-white.svg   every asset on the White theme's background
//   brand/preview-g100.svg    every asset on G100 background and layer-01, and the rule for
//                             layer-02 (no tile there, the white mark instead)
//   brand/preview-icons.svg   the app icons (any, maskable, Apple touch, the 1024 px master)
//                             and the favicons at their real sizes
// scripts/render_pngs.mjs renders each sheet to a PNG at 1 px per unit, so the 16, 32 and 48 px
// rasters on the sheets show at their real size.
//
// Run: npm run build:all (README, "Building"), after scripts/build_logo.mjs. The sheets embed
// the brand SVGs written by that step (as nested <svg> elements, no <image>) and draw the
// favicon rasters as one rect per pixel, rendered here with the same resvg call that writes the
// favicon PNGs. Labels are outlined IBM Plex Sans, so the sheets need no font either. Colours
// come from theme/tokens.json only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BRAND_DIR, GEOMETRY, ROOT, fmt, loadFont, outline, svgDoc } from './build_logo.mjs';
import { decodeRGBA, render } from './png.mjs';

const P = (...p) => path.join(ROOT, ...p);
const readBrand = (f) => fs.readFileSync(P(BRAND_DIR, f), 'utf8');

export const SHEETS = ['preview-white.svg', 'preview-g100.svg', 'preview-icons.svg'];
export const WIDTH = 1200;
const PAD = 48;
// iOS and macOS draw the full-bleed Apple icon with rounded corners (a continuous curve close to
// a radius of 22.37 % of the edge); the sheet shows that shape approximately, as a rounded rect.
const APPLE_RADIUS = 0.2237;

// The body of a brand SVG (without <svg> and <title>) and its viewBox.
export function parts(svg) {
  const m = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)" role="img">\n<title>[^<]*<\/title>\n([\s\S]*)\n<\/svg>\n$/.exec(svg);
  if (!m) throw new Error('not a brand SVG');
  return { viewBox: m[1].split(' ').map(Number), body: m[2] };
}

// A brand SVG placed at (x, y) with width w (or height h) in sheet px, as a nested <svg>.
function embed(file, x, y, { w, h, body: replace } = {}) {
  const { viewBox: [vx, vy, vw, vh], body } = parts(readBrand(file));
  const width = w ?? (h * vw) / vh;
  const height = h ?? (w * vh) / vw;
  const inner = replace ? replace(body) : body;
  return { w: width, h: height, markup: `<svg x="${fmt(x, 2)}" y="${fmt(y, 2)}" width="${fmt(width, 2)}" height="${fmt(height, 2)}" viewBox="${[vx, vy, vw, vh].map((v) => fmt(v)).join(' ')}">\n${inner}\n</svg>` };
}

// The favicon as rendered at `size` px: one rect per pixel with alpha, k sheet px per pixel.
export function rasterOf(size) {
  return decodeRGBA(render(readBrand('keepia-mark.svg'), size).png);
}
function raster(img, x0, y0, k) {
  // Whole sheet pixels, so each raster pixel covers whole PNG pixels of the rendered sheet.
  const x = Math.round(x0);
  const y = Math.round(y0);
  const out = [];
  for (let py = 0; py < img.height; py++) {
    for (let px = 0; px < img.width; px++) {
      const i = (py * img.width + px) * 4;
      const a = img.data[i + 3];
      if (a === 0) continue;
      const hex = `#${[0, 1, 2].map((c) => img.data[i + c].toString(16).padStart(2, '0')).join('')}`;
      out.push(`<rect x="${fmt(x + px * k, 2)}" y="${fmt(y + py * k, 2)}" width="${k}" height="${k}" fill="${hex}"${a === 255 ? '' : ` fill-opacity="${fmt(a / 255, 4)}"`}/>`);
    }
  }
  return `<g data-raster="${img.width}">\n${out.join('\n')}\n</g>`;
}

// A frame (evenodd ring) between the box and the box grown by c on every side: the clear space.
const frame = (fill, x, y, w, h, c) =>
  `<path fill="${fill}" fill-rule="evenodd" d="M${fmt(x - c, 2)} ${fmt(y - c, 2)} H${fmt(x + w + c, 2)} V${fmt(y + h + c, 2)} H${fmt(x - c, 2)} Z M${fmt(x, 2)} ${fmt(y, 2)} V${fmt(y + h, 2)} H${fmt(x + w, 2)} V${fmt(y, 2)} Z"/>`;

function sheetKit(geo) {
  const regular = loadFont(geo.text.productFont);
  const semi = loadFont(geo.text.font);
  const label = (fill, text, x, y, size = 12, font = regular) => {
    const o = outline(font, text, size);
    return { w: o.advance, markup: `<path fill="${fill}" transform="translate(${fmt(x, 2)} ${fmt(y, 2)})" d="${o.d}"/>` };
  };
  return { label, heading: (fill, text, x, y) => label(fill, text, x, y, 16, semi) };
}

// A row of items left to right, each with a caption below; returns the markup and its height.
function row(kit, t, x0, y0, items, gap = 32) {
  const out = [];
  let x = x0;
  const h = Math.max(...items.map((i) => i.h));
  for (const it of items) {
    const r = it.at(x, y0 + (it.alignBottom ? h - it.h : 0));
    out.push(r);
    let w = it.w;
    if (it.caption) {
      const l = kit.label(t['text-secondary'], it.caption, x, y0 + h + 18);
      out.push(l.markup);
      w = Math.max(w, l.w);
    }
    x += w + gap;
  }
  return { markup: out.join('\n'), h: h + (items.some((i) => i.caption) ? 30 : 0) };
}

const item = (w, h, at, caption, alignBottom = true) => ({ w, h, at, caption, alignBottom });
const embedItem = (file, size, caption, by = 'w') => {
  const probe = embed(file, 0, 0, { [by]: size });
  return item(probe.w, probe.h, (x, y) => embed(file, x, y, { [by]: size }).markup, caption);
};

// One panel of a theme sheet: the assets of `variant` (light or dark) on the ground `ground`.
function themePanel(kit, geo, t, variant, y0, ground, groundName, mono) {
  const out = [];
  let y = y0 + PAD;
  const head = (text) => { out.push(kit.heading(t['text-primary'], text, PAD, y + 16).markup); y += 36; };
  const add = (r) => { out.push(r.markup); y += r.h + 28; };

  head(`Mark on ${groundName}`);
  const r16 = rasterOf(16);
  add(row(kit, t, PAD, y, [
    ...[128, 64, 32, 16].map((s) => embedItem('keepia-mark.svg', s, `${s} px`)),
    item(16, 16, (x, yy) => raster(r16, x, yy, 1), '16 px raster'),
    item(128, 128, (x, yy) => raster(r16, x, yy, 8), '16 px raster, 8x'),
  ]));

  head('Clear space: one bar width of free space around the logo');
  const tile = 128;
  const c = (geo.clearSpace / geo.grid) * tile;
  const F = 40;
  const lock = embed(`keepia-lockup-${variant}.svg`, 0, 0, { h: (geo.lockups.keepia.horizontal.tile.size / geo.text.fontSize) * F });
  const lc = (geo.clearSpace / geo.grid) * lock.h;
  // Each item is the logo with its clear space drawn as a frame around it, in `border-strong-01`
  // (at least 3:1 against background and layer-01 in both themes, so the frame shows on G100).
  const zone = t['border-strong-01'];
  add(row(kit, t, PAD, y, [
    item(tile + 2 * c, tile + 2 * c, (x, yy) => `${frame(zone, x + c, yy + c, tile, tile, c)}\n${embed('keepia-mark.svg', x + c, yy + c, { w: tile }).markup}`, `${fmt(c, 2)} px around a ${tile} px tile`),
    item(lock.w + 2 * lc, lock.h + 2 * lc, (x, yy) => `${frame(zone, x + lc, yy + lc, lock.w, lock.h, lc)}\n${embed(`keepia-lockup-${variant}.svg`, x + lc, yy + lc, { h: lock.h }).markup}`, `${fmt(lc, 2)} px around a lockup with a ${fmt(lock.h, 2)} px tile`),
  ], 48));

  head('Lockups');
  const hF = 32;
  for (const p of [null, 'mail', 'docs', 'archive']) {
    const f = p ? `keepia-${p}-lockup-${variant}.svg` : `keepia-lockup-${variant}.svg`;
    const vb = parts(readBrand(f)).viewBox;
    const e = embed(f, PAD, y, { h: (vb[3] / geo.text.fontSize) * hF });
    out.push(e.markup);
    y += e.h + 20;
  }
  y += 12;
  const sF = 24;
  add(row(kit, t, PAD, y, [null, 'mail', 'docs', 'archive'].map((p) => {
    const f = p ? `keepia-${p}-lockup-stacked-${variant}.svg` : `keepia-lockup-stacked-${variant}.svg`;
    const vb = parts(readBrand(f)).viewBox;
    return embedItem(f, (vb[3] / geo.text.fontSize) * sF, '', 'h');
  }), 56));

  head('Monochrome');
  add(row(kit, t, PAD, y, [
    embedItem('keepia-mark-teal.svg', 64, 'teal'),
    embedItem(`keepia-mark-${mono}.svg`, 64, mono),
    embedItem(`keepia-lockup-${mono}.svg`, (parts(readBrand(`keepia-lockup-${mono}.svg`)).viewBox[3] / geo.text.fontSize) * hF, '', 'h'),
    embedItem(`keepia-mail-lockup-${mono}.svg`, (parts(readBrand(`keepia-mail-lockup-${mono}.svg`)).viewBox[3] / geo.text.fontSize) * hF, '', 'h'),
  ], 40));

  head('Browser tab, 16 px favicon');
  const tabW = 240;
  const tabH = 36;
  // The tab carries the Teal tile, so in G100 it sits only on an allowed ground (README, "Logo":
  // background or layer-01): layer-01 on the background panel, background on the layer-01 panel.
  const tabGround = variant === 'light' || ground === t.background ? t['layer-01'] : t.background;
  out.push(`<rect fill="${tabGround}" x="${PAD}" y="${fmt(y, 2)}" width="${tabW}" height="${tabH}" rx="8"/>`);
  out.push(raster(r16, PAD + 12, y + 10, 1));
  out.push(kit.label(t['text-primary'], 'Keepia Mail', PAD + 36, y + 22, 13).markup);
  y += tabH + PAD;
  return { markup: [`<rect fill="${ground}" x="0" y="${fmt(y0, 2)}" width="${WIDTH}" height="${fmt(y - y0, 2)}"/>`, ...out].join('\n'), h: y - y0 };
}

function whiteSheet(kit, geo, tokens) {
  const t = tokens.light;
  const p = themePanel(kit, geo, t, 'light', 0, t.background, `White background ${t.background}`, 'black');
  return svgDoc(`0 0 ${WIDTH} ${fmt(p.h, 2)}`, 'Keepia logo on White', [p.markup]);
}

function g100Sheet(kit, geo, tokens) {
  const t = tokens.dark;
  const a = themePanel(kit, geo, t, 'dark', 0, t.background, `G100 background ${t.background}`, 'white');
  const b = themePanel(kit, geo, t, 'dark', a.h, t['layer-01'], `G100 layer-01 ${t['layer-01']}`, 'white');
  // layer-02: the tile reaches only 2.32:1 there, so the white mark replaces it (README, "Logo").
  const y0 = a.h + b.h;
  const out = [`<rect fill="${t['layer-02']}" x="0" y="${fmt(y0, 2)}" width="${WIDTH}" height="${fmt(200, 2)}"/>`];
  out.push(kit.heading(t['text-primary'], `G100 layer-02 ${t['layer-02']}: no tile, the white mark`, PAD, y0 + PAD + 16).markup);
  out.push(embed('keepia-mark-white.svg', PAD, y0 + PAD + 36, { w: 64 }).markup);
  const lf = 'keepia-mail-lockup-white.svg';
  out.push(embed(lf, PAD + 104, y0 + PAD + 36 + 16, { h: (parts(readBrand(lf)).viewBox[3] / geo.text.fontSize) * 32 }).markup);
  return svgDoc(`0 0 ${WIDTH} ${fmt(y0 + 200, 2)}`, 'Keepia logo on G100', [a.markup, b.markup, ...out]);
}

function iconSheet(kit, geo, tokens) {
  const t = tokens.light;
  const out = [];
  let y = PAD;
  const head = (text) => { out.push(kit.heading(t['text-primary'], text, PAD, y + 16).markup); y += 36; };
  const add = (r) => { out.push(r.markup); y += r.h + 28; };
  const tileColour = t['background-brand'];
  const m = geo.maskable;

  head('Web app icons: icon-512.png (shown at 256 px) and icon-192.png, purpose any');
  add(row(kit, t, PAD, y, [embedItem('keepia-mark.svg', 256, 'icon-512.png at 50 %'), embedItem('keepia-mark.svg', 192, 'icon-192.png')]));

  head(`Maskable: icon-maskable-512.png at 50 %, safe circle r ${fmt(m.safeRadiusPx / 2, 2)} px`);
  const s = 256;
  const k = s / m.size;
  const ring = (cx, cy, r) => `<path fill="${t['text-on-color']}" fill-opacity="0.7" fill-rule="evenodd" d="M${fmt(cx - r, 2)} ${fmt(cy, 2)} A${fmt(r, 2)} ${fmt(r, 2)} 0 1 0 ${fmt(cx + r, 2)} ${fmt(cy, 2)} A${fmt(r, 2)} ${fmt(r, 2)} 0 1 0 ${fmt(cx - r, 2)} ${fmt(cy, 2)} Z M${fmt(cx - r + 1.5, 2)} ${fmt(cy, 2)} A${fmt(r - 1.5, 2)} ${fmt(r - 1.5, 2)} 0 1 0 ${fmt(cx + r - 1.5, 2)} ${fmt(cy, 2)} A${fmt(r - 1.5, 2)} ${fmt(r - 1.5, 2)} 0 1 0 ${fmt(cx - r + 1.5, 2)} ${fmt(cy, 2)} Z"/>`;
  const noGround = (body) => body.split('\n').slice(1).join('\n');
  add(row(kit, t, PAD, y, [
    item(s, s, (x, yy) => `${embed('icon-maskable.svg', x, yy, { w: s }).markup}\n${ring(x + s / 2, yy + s / 2, m.safeRadiusPx * k)}`, 'full bleed, with the safe circle'),
    item(s, s, (x, yy) => `<circle fill="${tileColour}" cx="${fmt(x + s / 2, 2)}" cy="${fmt(yy + s / 2, 2)}" r="${fmt(s / 2, 2)}"/>\n${embed('icon-maskable.svg', x, yy, { w: s, body: noGround }).markup}`, 'masked to a circle'),
    item(s, s, (x, yy) => `<rect fill="${tileColour}" x="${fmt(x, 2)}" y="${fmt(yy, 2)}" width="${s}" height="${s}" rx="${fmt(s * 0.25, 2)}"/>\n${embed('icon-maskable.svg', x, yy, { w: s, body: noGround }).markup}`, 'masked to a rounded square'),
  ]));

  head('Apple: apple-touch-icon.png (180 px) and the opaque master icon-1024.png (shown at 25 %)');
  const rounded = (body) => body.replace(/^<rect ([^>]*)\/>/, (_, a) => `<rect ${a} rx="${fmt(geo.grid * APPLE_RADIUS, 4)}"/>`);
  add(row(kit, t, PAD, y, [
    embedItem('apple-touch-icon.svg', 180, 'apple-touch-icon.png, full bleed'),
    item(180, 180, (x, yy) => embed('apple-touch-icon.svg', x, yy, { w: 180, body: rounded }).markup, 'as iOS rounds it (approximate)'),
    embedItem('apple-touch-icon.svg', 256, 'icon-1024.png at 25 %'),
  ]));

  head('Favicons at real size (favicon.ico holds 16, 32 and 48 px), 16 and 32 px also at 4x');
  const rs = [16, 32, 48].map((n) => rasterOf(n));
  add(row(kit, t, PAD, y, [
    ...rs.map((r) => item(r.width, r.height, (x, yy) => raster(r, x, yy, 1), `${r.width} px`)),
    ...rs.slice(0, 2).map((r) => item(r.width * 4, r.height * 4, (x, yy) => raster(r, x, yy, 4), `${r.width} px, 4x`)),
  ]));
  y += PAD - 28;
  return svgDoc(`0 0 ${WIDTH} ${fmt(y, 2)}`, 'Keepia app icons and favicons', [`<rect fill="${t.background}" width="${WIDTH}" height="${fmt(y, 2)}"/>`, ...out]);
}

export function build() {
  const geo = JSON.parse(fs.readFileSync(P(GEOMETRY), 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(P('theme/tokens.json'), 'utf8'));
  const kit = sheetKit(geo);
  const sheets = {
    'preview-white.svg': whiteSheet(kit, geo, tokens),
    'preview-g100.svg': g100Sheet(kit, geo, tokens),
    'preview-icons.svg': iconSheet(kit, geo, tokens),
  };
  for (const f of fs.readdirSync(P(BRAND_DIR))) {
    if (f.startsWith('preview-') && f.endsWith('.svg') && !Object.hasOwn(sheets, f)) fs.rmSync(P(BRAND_DIR, f));
  }
  for (const [f, s] of Object.entries(sheets)) fs.writeFileSync(P(BRAND_DIR, f), s);
  console.log(`build_previews: ${Object.keys(sheets).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
