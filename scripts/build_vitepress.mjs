// Builds the VitePress theme (keepia/mail#7, part 4):
//   theme/vitepress.css   VitePress variables mapped to the Keepia tokens, IBM Plex from fonts/,
//                         Carbon corners, focus and custom-block icons
// from theme/tokens.json (written by scripts/build.mjs, the step before this one) and
// scripts/vitepress-map.mjs, with the font stacks of @carbon/type and the 20 px filled icons
// of @carbon/icons.
// Run: npm run build:all (README, "Building"), which runs this script among its steps.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BLOCK_ICONS, ICON_MODULES, vitepressCss } from './vitepress-map.mjs';

const require = createRequire(import.meta.url);
const colors = require('@carbon/colors');
const type = require('@carbon/type');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const P = (...p) => path.join(ROOT, ...p);
const tokens = JSON.parse(fs.readFileSync(P('theme/tokens.json'), 'utf8'));

// Carbon's font stacks with double quotes, as CSS writes them.
const families = { sans: type.fontFamilies.sans.replace(/'/g, '"'), mono: type.fontFamilies.mono.replace(/'/g, '"') };

// An icon of @carbon/icons is a descriptor { elem: 'svg', attrs: { viewBox }, content: [paths] };
// the inner path carries data-icon-path="inner-path". Whitespace in the path data is
// normalised to single spaces (WarningFilled has a tab), as @carbon/icons-react writes it.
function iconShape(name) {
  const mod = require(ICON_MODULES[name]);
  const icon = mod.default ?? mod;
  const paths = icon.content.filter((c) => c.elem === 'path').map((c) => ({ d: c.attrs.d.replace(/\s+/g, ' ').trim(), inner: c.attrs['data-icon-path'] === 'inner-path' }));
  const outer = paths.filter((p) => !p.inner);
  const inner = paths.filter((p) => p.inner);
  if (outer.length !== 1 || inner.length !== 1) throw new Error(`${name}: expected one outer and one inner path`);
  return { viewBox: icon.attrs.viewBox, outer: outer[0].d, inner: inner[0].d };
}
const shapes = Object.fromEntries([...new Set(Object.values(BLOCK_ICONS))].map((name) => [name, iconShape(name)]));

const css = vitepressCss({ light: tokens.light, dark: tokens.dark }, families, { shapes, black: colors.black100.toLowerCase() });
fs.writeFileSync(P('theme/vitepress.css'), css);
console.log('theme/vitepress.css', css.split('\n').length - 1, 'lines');
