// Captures what theme/vitepress.css has to know about VitePress's default theme into
// scripts/fixtures/vitepress-<version>.json, which the tests read (no network in tests).
// Ported from pklnx/design-system (keepia/mail#7, part 4); the colour declarations
// (colorRules), the custom properties of every captured stylesheet (customProperties) and
// the @docsearch/css stylesheets that styles/docsearch.css @imports are new here, for the
// brand-soft guard.
//
// Run it by hand when the products upgrade VitePress (they pin it exactly), from the
// repository root, on the unpacked npm tarballs of VitePress and of the @docsearch/css version
// DOCSEARCH_CSS_VERSION in scripts/vitepress-map.mjs names:
//
//   dir="$(mktemp -d)"
//   (cd "$dir" && npm pack vitepress@2.0.0-alpha.20 @docsearch/css@4.7.0 \
//     && mkdir vp ds && tar -xzf vitepress-2.0.0-alpha.20.tgz -C vp && tar -xzf docsearch-css-4.7.0.tgz -C ds)
//   node scripts/capture-vitepress-fixture.mjs "$dir/vp/package" "$dir/ds/package"
//
// (Installed copies work too: node scripts/capture-vitepress-fixture.mjs
// <dir>/node_modules/vitepress <dir>/node_modules/@docsearch/css.) Then set VITEPRESS_VERSION in scripts/vitepress-map.mjs,
// delete the old fixture and run `npm test`: every new VitePress rule that sets a corner, an
// outline or a font fails the tests until scripts/vitepress-map.mjs overrides it or keeps it
// with a reason.
//
// It reads, under dist/client/theme-default/:
//   styles/vars.css           every --vp-* custom property, per selector, and its value
//   components/*.vue          every <style> block, with its scoped flag (the theme ships
//                             SFC sources, not compiled component CSS)
//   styles/**/*.css           with the @layer name where there is one
// and records every rule that sets a corner (border-radius and its longhands), an outline
// (outline, outline-style, outline-width), a font (font-family, font), box-shadow or a
// border (border, border-left, border-inline, border-inline-start and their -color,
// -width and -style); the corner, outline and font properties are CLASSIFIED_GROUPS in
// scripts/vitepress-map.mjs:
// file, line, selector, media condition, scoped, layer, !important, specificity (scoped
// rules get Vue's [data-v-…] attribute, +(0,1,0)) and whether the component is loaded
// async (its CSS then arrives after theme/vitepress.css). It also records the static
// classes all root elements of each component carry (componentRoots): a scoped rule styles
// a root or an element inside one, so the tests read the root as the rule's ancestor.
// Separately (colorRules) it records every rule that sets the text colour or a background
// (COLOR_PROPERTIES), so the tests can check which colours VitePress paints on which ground.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCss, specificity, splitTopLevel } from './css-selectors.mjs';
import { CLASSIFIED } from './vitepress-map.mjs';

// Border properties are recorded too: theme/vitepress.css gives custom blocks a left
// stripe, and the tests check every border rule that reaches a custom block.
const BORDERS = ['', '-left', '-inline', '-inline-start'].flatMap((side) => ['', '-color', '-width', '-style'].map((part) => `border${side}${part}`));
export const PROPERTIES = [...CLASSIFIED, 'box-shadow', ...BORDERS];
export const COLOR_PROPERTIES = ['color', 'background', 'background-color'];

const listFiles = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return listFiles(p, ext);
  return d.name.endsWith(ext) ? [p] : [];
});

// Component files a component loads with defineAsyncComponent(() => import('./X.vue')).
function asyncComponents(themeDir) {
  const found = new Set();
  for (const f of [...listFiles(themeDir, '.vue'), ...listFiles(themeDir, '.js')]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/defineAsyncComponent\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+\.vue)["']\s*\)\s*\)/g)) {
      found.add(path.relative(themeDir, path.resolve(path.dirname(f), m[1])).split(path.sep).join('/'));
    }
  }
  return [...found].sort();
}

// The static classes every root element of a component carries. The roots are the top-level
// elements of its <template> (v-if/v-else branches and fragments have several), looking
// through the built-in wrappers (Teleport, Transition, ClientOnly, <template v-if>). A scoped
// rule of the component styles a root or an element inside one.
const WRAPPERS = new Set(['Teleport', 'Transition', 'ClientOnly', 'template']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function rootClasses(src) {
  const template = /^<template>([\s\S]*)^<\/template>/m.exec(src)?.[1] ?? '';
  const roots = [];
  const open = []; // the open elements: true for a wrapper
  const body = template.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) { open.pop(); continue; }
    if (open.every(Boolean)) {
      if (WRAPPERS.has(tag)) { if (!selfClosing) open.push(true); continue; }
      roots.push((/\sclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean));
    }
    if (!selfClosing && !VOID.has(tag.toLowerCase())) open.push(false);
  }
  if (open.length) throw new Error(`unbalanced <template>: ${open.length} element(s) left open`);
  return roots.length ? roots[0].filter((c) => roots.every((r) => r.includes(c))) : [];
}

// The <style> blocks of a .vue file, with their CSS and the line their content starts on.
function styleBlocks(src) {
  const blocks = [];
  for (const m of src.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
    if (/\b(lang|module|src)\b/.test(m[1])) throw new Error(`unsupported <style${m[1]}>`);
    const startLine = src.slice(0, m.index).split('\n').length; // line of <style>
    blocks.push({ scoped: /\bscoped\b/.test(m[1]), css: m[2], lineOffset: startLine - 1 });
  }
  return blocks;
}

// The stylesheets a component imports from its <script> (`import "../styles/x.css"`), as paths
// relative to the theme directory.
function importedStyles(themeDir, file) {
  const src = fs.readFileSync(path.join(themeDir, file), 'utf8');
  return [...src.matchAll(/^import\s+["']([^"']+\.css)["']/gm)]
    .map((m) => path.relative(themeDir, path.resolve(path.dirname(path.join(themeDir, file)), m[1])).split(path.sep).join('/'));
}

// The @docsearch/css stylesheets a stylesheet @imports (`@import '@docsearch/css/dist/x.css'`).
const docsearchImports = (css) => [...css.matchAll(/@import\s+['"]@docsearch\/css\/([^'"]+)['"]/g)].map((m) => m[1]);

// docsearchDir: the @docsearch/css package that styles/docsearch.css @imports; by default the
// one installed next to vitepress.
export function capture(pkgDir, docsearchDir = path.dirname(createRequire(path.join(pkgDir, 'package.json')).resolve('@docsearch/css/package.json'))) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  if (pkg.name !== 'vitepress') throw new Error(`${pkgDir} is not the vitepress package`);
  const dsPkg = JSON.parse(fs.readFileSync(path.join(docsearchDir, 'package.json'), 'utf8'));
  if (dsPkg.name !== '@docsearch/css') throw new Error(`${docsearchDir} is not the @docsearch/css package`);
  const themeDir = path.join(pkgDir, 'dist/client/theme-default');
  const rel = (f) => path.relative(themeDir, f).split(path.sep).join('/');
  const asyncFiles = asyncComponents(themeDir);
  // Stylesheets that only async components import load after theme/vitepress.css, like the
  // components themselves (styles/docsearch.css, through VPAlgoliaSearchBox).
  const asyncStyles = asyncFiles.flatMap((f) => importedStyles(themeDir, f));
  const loadsAsync = (file) => asyncFiles.includes(file) || asyncStyles.includes(file);

  // vars.css: the custom properties per selector (selectors kept as written).
  const varsFile = path.join(themeDir, 'styles/vars.css');
  const vars = {};
  for (const r of parseCss(fs.readFileSync(varsFile, 'utf8')).rules) {
    const names = r.decls.map((d) => d.prop).filter((p) => p.startsWith('--'));
    if (!names.length) continue;
    const key = r.media ? `@media ${r.media} { ${r.selector} }` : r.selector;
    vars[key] = [...new Set([...(vars[key] ?? []), ...names])].sort();
  }

  // The root classes of every component.
  const roots = {};
  for (const f of listFiles(path.join(themeDir, 'components'), '.vue').sort()) {
    const classes = rootClasses(fs.readFileSync(f, 'utf8'));
    if (classes.length) roots[rel(f)] = classes;
  }

  const sources = [
    ...listFiles(path.join(themeDir, 'components'), '.vue').map((f) => ({ f, blocks: styleBlocks(fs.readFileSync(f, 'utf8')) })),
    ...listFiles(path.join(themeDir, 'styles'), '.css').map((f) => ({ f, blocks: [{ scoped: false, css: fs.readFileSync(f, 'utf8'), lineOffset: 0 }] })),
  ].sort((a, b) => rel(a.f).localeCompare(rel(b.f)));

  // `rules` (pklnx's capture) reads only the VitePress theme. The colour declarations and the
  // custom properties also read the @docsearch/css files a stylesheet @imports, just before
  // that stylesheet, as the cascade has them; Algolia's own corner, outline and font rules
  // are not classified (the products use the local search).
  const rules = [];
  const colorRules = [];
  const customProperties = [];
  const record = (file, b, colourOnly, isAsync) => {
    for (const r of parseCss(b.css).rules) {
      for (const d of r.decls) {
        const custom = d.prop.startsWith('--');
        const into = custom ? customProperties : !colourOnly && PROPERTIES.includes(d.prop) ? rules : COLOR_PROPERTIES.includes(d.prop) ? colorRules : null;
        if (!into) continue;
        if (r.parents.length) throw new Error(`${file}:${r.line + b.lineOffset}: nested rule sets ${d.prop}; extend the capture`);
        for (const selector of splitTopLevel(r.selector, ',')) {
          const entry = {
            file,
            line: r.line + b.lineOffset,
            selector: selector.replace(/\s+/g, ' '),
            property: d.prop,
            value: d.value,
            important: d.important,
            media: r.media,
            layer: r.layer,
            scoped: b.scoped,
            async: into === rules ? asyncFiles.includes(file) : isAsync,
            specificity: specificity(selector, { scoped: b.scoped }),
          };
          into.push(entry);
        }
      }
    }
  };
  const docsearchFiles = [];
  for (const { f, blocks } of sources) {
    const file = rel(f);
    for (const b of blocks) {
      for (const sub of docsearchImports(b.css)) {
        const dsFile = `@docsearch/css/${sub}`;
        docsearchFiles.push(dsFile);
        record(dsFile, { css: fs.readFileSync(path.join(docsearchDir, sub), 'utf8'), lineOffset: 0, scoped: false }, true, loadsAsync(file));
      }
      record(file, b, false, loadsAsync(file));
    }
  }
  return {
    source: `npm pack vitepress@${pkg.version}, dist/client/theme-default (captured by scripts/capture-vitepress-fixture.mjs)`,
    version: pkg.version,
    properties: PROPERTIES,
    asyncComponents: asyncFiles,
    componentRoots: roots,
    vars,
    rules,
    colorProperties: COLOR_PROPERTIES,
    docsearch: { version: dsPkg.version, files: docsearchFiles },
    customProperties,
    colorRules,
  };
}

function main() {
  const [dir, docsearchDir] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: node scripts/capture-vitepress-fixture.mjs <unpacked vitepress package dir> [<unpacked @docsearch/css package dir>]');
    process.exit(2);
  }
  const data = docsearchDir ? capture(path.resolve(dir), path.resolve(docsearchDir)) : capture(path.resolve(dir));
  const out = fileURLToPath(new URL(`./fixtures/vitepress-${data.version}.json`, import.meta.url));
  fs.writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`${path.relative(process.cwd(), out)}: ${data.rules.length} rules, ${data.colorRules.length} colour rules, ${data.customProperties.length} custom properties, ${Object.keys(data.vars).length} variable blocks, @docsearch/css ${data.docsearch.version}, async ${data.asyncComponents.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
