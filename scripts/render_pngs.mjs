// Renders the PNGs of the logo from their SVGs with resvg, writes brand/favicon.ico and
// brand/manifest.json (keepia/mail#7, part 3; as pklnx/design-system's render_pngs.mjs).
//
// Run: npm run build:all (README, "Building"), after scripts/build_logo.mjs and
// scripts/build_previews.mjs, whose SVGs it reads.
//
// Each PNG carries the sha256 of its source SVG in a tEXt chunk (SOURCE_KEY), and the manifest
// lists every PNG with its size, source, source sha256 and PNG sha256, so the tests catch a PNG
// that was not rendered again after its SVG changed. favicon.ico holds the 16, 32 and 48 px
// PNGs unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BRAND_DIR, ROOT } from './build_logo.mjs';
import { SHEETS } from './build_previews.mjs';
import { RESVG_VERSION, render, sha256, withText, writeIco } from './png.mjs';

const P = (...p) => path.join(ROOT, ...p);
export const MANIFEST = `${BRAND_DIR}/manifest.json`;
export const ICO = `${BRAND_DIR}/favicon.ico`;
export const SOURCE_KEY = 'keepia:source-sha256';
export const FAVICON_SIZES = [16, 32, 48];

// [png, source svg, width in px]; the height follows from the SVG's viewBox. A width of null is
// the sheet's own width (1 px per unit).
const b = (f) => `${BRAND_DIR}/${f}`;
export const JOBS = [
  ...FAVICON_SIZES.map((s) => [b(`favicon-${s}.png`), b('keepia-mark.svg'), s]),
  [b('icon-192.png'), b('keepia-mark.svg'), 192],
  [b('icon-512.png'), b('keepia-mark.svg'), 512],
  [b('icon-maskable-512.png'), b('icon-maskable.svg'), 512],
  [b('apple-touch-icon.png'), b('apple-touch-icon.svg'), 180],
  [b('icon-1024.png'), b('apple-touch-icon.svg'), 1024],
  ...SHEETS.map((f) => [b(f.replace(/\.svg$/, '.png')), b(f), null]),
];

const viewBoxWidth = (svg) => Number(/viewBox="[^"]*?\S+ \S+ (\S+) \S+"/.exec(svg)[1]);

export function build() {
  const entries = [];
  const written = {};
  for (const [out, source, width] of JOBS) {
    const svg = fs.readFileSync(P(source));
    const sourceSha = sha256(svg);
    const text = svg.toString('utf8');
    const img = render(text, width ?? Math.round(viewBoxWidth(text)));
    const png = withText(img.png, SOURCE_KEY, sourceSha);
    fs.writeFileSync(P(out), png);
    written[out] = png;
    entries.push({ path: out, width: img.width, height: img.height, source, sourceSha256: sourceSha, sha256: sha256(png) });
  }
  const ico = writeIco(FAVICON_SIZES.map((s) => written[b(`favicon-${s}.png`)]));
  fs.writeFileSync(P(ICO), ico);
  for (const f of fs.readdirSync(P(BRAND_DIR))) {
    if (f.endsWith('.png') && !Object.hasOwn(written, b(f))) fs.rmSync(P(BRAND_DIR, f));
  }
  entries.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  const manifest = {
    renderer: `@resvg/resvg-js ${RESVG_VERSION}`,
    pngs: entries,
    ico: { path: ICO, sizes: FAVICON_SIZES, sources: FAVICON_SIZES.map((s) => b(`favicon-${s}.png`)), sha256: sha256(ico) },
  };
  fs.writeFileSync(P(MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`render_pngs: ${entries.length} PNGs, ${ICO}, ${MANIFEST}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
