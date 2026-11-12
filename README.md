# Keepia design system

The brand of Keepia (Mail, Docs and Archive): **IBM Carbon v11 with Teal as the interactive colour**, the mark and the wordmark `keepia` in IBM Plex Sans.

This repository will hold the Carbon theme and tokens for White and G100, the logo, lockups, app icons and favicons, and a VitePress theme for the products' documentation, released as an npm-format tarball on a GitHub release. The work is planned in [keepia/mail#7](https://github.com/keepia/mail/issues/7) and tracked there. Part 1 set up the repository; part 2 adds the Carbon theme, the tokens and the contrast checks (see Theme); part 4 the VitePress theme (see VitePress). Nothing is released yet.

**Status: in development.**

## Building

Node 26, as declared in `.node-version`: the one place for the version. The workflows read it through the local action `.github/actions/setup` (`actions/setup-node` with `node-version-file`, then `npm ci --ignore-scripts`), `scripts/workflows.test.mjs` checks that nothing else names a Node version, and `devEngines` in `package.json` makes npm warn on an older Node when you work in this repository. `devEngines` (unlike `engines`) is ignored when the package is installed as a dependency, so the tarball puts no requirement on consumers.

```sh
npm ci --ignore-scripts   # no install scripts, as in CI
npm run build:all         # every generated file, in the order below
npm test                  # all tests (no network)
npm pack --dry-run --json --ignore-scripts | node scripts/check-pack.mjs   # the package contents
```

`npm run build:all` (`scripts/build_all.mjs`) is the one place that defines the order of the generation steps. It runs these commands, in this order, and stops at the first one that fails:

```sh
node scripts/build.mjs
node scripts/build_vitepress.mjs
```

`scripts/build.mjs` writes `theme/keepia-carbon.css`, `theme/_index.scss`, `theme/tokens.json`, `theme/contrast-report.json`, `fonts/` and `THIRD_PARTY_NOTICES.md` from `theme/brand.json` and the installed Carbon and IBM Plex packages. `scripts/build_vitepress.mjs` then writes `theme/vitepress.css` from `theme/tokens.json` and `scripts/vitepress-map.mjs` (see VitePress). The logo adds its steps later.

`lightningcss` (`1.33.0`) is pinned exactly, as in pklnx/design-system, like every other dev dependency here: only `scripts/vitepress-theme.test.mjs` uses it, to check how Vite 8's CSS minifier treats `theme/vitepress.css` (the legal comment, the escaping in `url()`), and that result can change between releases of Lightning CSS. Move the pin together with `VITEPRESS_VERSION` (see VitePress).

CI (step "Generated files are committed") runs `npm run build:all` and fails when it changes the tree, so generated files are committed together with the change that produces them.

The secret scan needs Go (the version in `tools/gitleaks/go.mod`) and is run with `make secrets-test secrets`; see [docs/development/index.md](docs/development/index.md).

## Theme

IBM Carbon v11, White and G100, with Teal as the interactive colour. Every Carbon Blue step becomes the same Teal step, including the Hover steps (`theme/brand.json`: `"primary": "teal"`). Status, syntax, AI, tag and `notification-background-info` tokens keep Carbon's colours, and so do visited links (Carbon's Purple stays distinct from Teal links). The G100 focus ring stays Carbon's white.

That changes 20 tokens in White and 19 in G100, 24 names in all; `theme/tokens.json` lists every colour token of both themes and, under `changed`, the ones that differ from Carbon. `theme/keepia-carbon.css` sets all 24 names in both theme blocks, each with its own theme's value, so a `:root` value of White never leaks into G100. Load it after Carbon's CSS and put `cds--white` or `cds--g100` on `<html>`:

```js
import '@carbon/styles/css/styles.css';
import '@keepia/design-system/theme/keepia-carbon.css';
```

Sass, through the `sass` export condition:

```scss
@use '@keepia/design-system/theme' as keepia;
@use '@carbon/styles/scss/theme' with ($theme: keepia.$g100);

.cds--g100 { @include keepia.overrides-dark; }   // component tokens (button) too
.cds--white { @include keepia.overrides-light; }
```

The package and its exports arrive with keepia/mail#7, part 5.

### Contrast

`scripts/contrast.test.mjs` checks both themes with WCAG 2.x ratios and fails `npm test` when a pair is below **4.5:1** for text or **3:1** for non-text UI (focus rings, borders, interactive icons, the logo tile). The pairs are in `scripts/contrast.mjs`; `theme/contrast-report.json` records every ratio. A pair of two unchanged Carbon values is exempt, but the exempt list is pinned in the test (today Carbon's White `support-warning` on `background` and `layer-01`, 1.68 and 1.53), so a new failing pair fails either way. The button focus ring passes when the better of `focus` and `focus-inset` reaches 3:1: in White, `focus` on the primary button is 1.00:1 and the inner ring gives 4.99:1.

The decided values: white on Teal 60 4.99:1, Teal 60 on White 4.99:1, Teal 40 on `#161616` 7.75:1, Teal 60 on `#161616` 3.63:1 (UI only).

## VitePress

`theme/vitepress.css` gives a VitePress docs site the Keepia look. It is written for the default theme of VitePress `2.0.0-alpha.20` (`VITEPRESS_VERSION` in `scripts/vitepress-map.mjs`; keepia/mail#7, decision T3, until keepia/mail's docs pin a version) and needs no Carbon CSS. It is a port of pklnx/design-system's VitePress theme:

- **Colours**: the VitePress colour variables get the Keepia tokens, White in light mode and G100 in `.dark`, with Teal as the accent: `--vp-c-brand-1` is `link-primary`, `-2` `link-primary-hover`, `-3` `button-primary`, `-soft` `highlight`. Badges use Carbon's tag colours; links in blocks stay link colours. The theme's own variables are `--keepia-vp-*`.
- **Custom blocks** (`::: info` … and GitHub alerts `> [!NOTE]` …) look like Carbon's low-contrast inline notification: the notification ground, a 3 px left stripe in the support colour, Carbon's 1 px frame in the same colour at opacity 0.4, and Carbon's filled icon before the title (InformationFilled, CheckmarkFilled, WarningFilled, ErrorFilled from `@carbon/icons`). `::: details` has no stripe, frame or icon. The stripe, frame and icon are decorative (the title carries the meaning), so they have no 3:1 contrast requirement.
- **Fonts**: IBM Plex Sans and IBM Plex Mono from this package's `fonts/`, with Carbon's fallback stacks (`@carbon/type`).
- **Corners**: square, as in Carbon (`border-radius: 0 !important` on the rounded VitePress components; the appearance switch, spinners and avatars stay round).
- **Focus**: Carbon's focus: an outer ring on text links, an inset ring on controls, the double ring on buttons.
- **Nav title**: the theme leaves it alone. The products show their product lockup as the logo and turn the site title off (keepia/mail#7, decision T6), so "keepia mail" keeps its two weights and two colours.

`docs/.vitepress/theme/index.ts`, in this order:

```ts
import DefaultTheme from 'vitepress/theme-without-fonts'; // VitePress without Inter
import '@keepia/design-system/theme/vitepress.css';
import './custom.css'; // the product's own rules, if any

export default DefaultTheme;
```

The file's `:root` and `.dark` blocks must come after VitePress's own, so it is imported after the VitePress theme. In `docs/.vitepress/config.mts`, the logo is the product lockup, one file per theme, and the favicon is the mark (the lockup and favicon files arrive with keepia/mail#7, part 3):

```ts
themeConfig: {
  logo: { light: '/keepia-mail-lockup-light.svg', dark: '/keepia-mail-lockup-dark.svg' },
  siteTitle: false,
},
head: [
  ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ['link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }],
],
```

The `@font-face` rules point to the font files relative to the CSS file; Vite emits them as hashed assets. The built site then carries IBM Plex, so it must also carry its license, `fonts/OFL.txt` of this package.

The block icons are inline `data:` SVGs in the CSS (Carbon icons, Apache-2.0, see `THIRD_PARTY_NOTICES.md`), so they need no extra request. Each icon carries its notice inside its SVG (`<!-- Carbon icon …, Copyright IBM Corp., Apache-2.0: … -->`), so minified builds keep it: Lightning CSS, Vite 8's CSS minifier, keeps the value of a `url()` (it drops the quotes and escapes the parentheses; `scripts/vitepress-theme.test.mjs` checks this with the pinned `lightningcss`). The `/*! … */` comment that opens the file is dropped there, because VitePress puts all CSS into one file after its own and Lightning CSS keeps a legal comment only at the start of a file. For the licence's full text the built site carries `THIRD_PARTY_NOTICES.md` as a file, as it carries `OFL.txt`. A site with a Content-Security-Policy must allow `img-src data:`.

**Contrast.** `scripts/vitepress-theme.test.mjs` checks every colour pair VitePress renders with the mapped variables (pklnx's `PAIRS`, more than 200 pairs over both themes) and Carbon's double focus ring on every button state. White `--vp-c-brand-1` on `--vp-c-brand-soft` (Teal 60 on Teal 20) is only 3.84:1, so it is not a pair: the brand-soft guard resolves every `color` and `background` declaration of VitePress (captured in the fixture) and of `theme/vitepress.css` through the mapped variables and fails when a rule paints brand-1 text on, inside or below a brand-soft ground.

When the products move to another VitePress version, capture its fixture (see the header of `scripts/capture-vitepress-fixture.mjs`), set `VITEPRESS_VERSION` in `scripts/vitepress-map.mjs` and run `npm test`. Every new VitePress rule that sets a corner, an outline or a font fails the tests until `scripts/vitepress-map.mjs` overrides it or keeps it with a reason.

## Logo

The logo arrives with keepia/mail#7, part 3. One rule follows from the theme already: the tile is Teal 60 (`background-brand`) in both themes. In G100 place the tile only on `background` or `layer-01` (3.63:1 and 3.03:1); on `layer-02` it reaches only 2.32:1, so use the white monochrome mark there.

## Layout

| Path | Contents |
| --- | --- |
| `.node-version` | The Node major for development and CI (workflows, `devEngines`, tests); see Building |
| `.github/workflows/ci.yml` | The `check` job: generated files are committed, `npm test`, package contents |
| `.github/workflows/secrets.yml` | The `secret-scan` job: gitleaks on the commits a pull request or a push to `main` adds |
| `.github/actions/setup/` | The composite action with the Node and `npm ci` steps and the only pin of `actions/setup-node` |
| `.github/dependabot.yml` | Weekly version updates with a 14-day cooldown for npm, GitHub Actions (workflows and the composite action) and Go (`tools/gitleaks`) |
| `.gitleaks.toml`, `Makefile`, `scripts/secret-scan-*.sh` | The secret scan, taken from keepia/mail |
| `tools/gitleaks/go.mod` | Only the Go version the secret scan builds gitleaks with; this repository has no Go code |
| `theme/brand.json` | The brand input of the theme: the Carbon hue that replaces Blue |
| `theme/keepia-carbon.css`, `theme/_index.scss`, `theme/tokens.json`, `theme/contrast-report.json` | The generated theme (see Theme) |
| `fonts/` | IBM Plex Sans and Mono (woff2) with `OFL.txt`, copied from the npm packages |
| `THIRD_PARTY_NOTICES.md` | The packages whose values or files ship, with their licence texts |
| `theme/vitepress.css` | The generated VitePress theme (see VitePress) |
| `scripts/build.mjs` | Generates the theme, fonts and notices |
| `scripts/build_vitepress.mjs` | Generates `theme/vitepress.css` from `theme/tokens.json`, `@carbon/type` and `@carbon/icons` |
| `scripts/vitepress-map.mjs` | The VitePress theme: variable → token map, the contrast pairs, the overridden and the kept VitePress rules |
| `scripts/css-selectors.mjs` | CSS parsing, specificity and selector matching for the VitePress tests and the capture |
| `scripts/capture-vitepress-fixture.mjs` | Captures `scripts/fixtures/vitepress-<version>.json` from the VitePress npm package, run by hand; the tests read the fixture |
| `scripts/contrast.mjs` | The contrast pairs and the WCAG 2.x ratio |
| `scripts/build_all.mjs` | `npm run build:all`: the one entry point for all generation steps (see Building) |
| `scripts/check-pack.mjs` | Fixes the package contents, file by file, and forbids lifecycle scripts |
| `scripts/workflow-rules.mjs`, `scripts/workflows.test.mjs` | The rules every workflow follows (parsed YAML): pins, permissions, triggers, required jobs, `run` without `${{ }}`, npm, checkouts, the Node prelude, Dependabot |
| `scripts/*.test.mjs` | The tests, run by `npm test` (no network) |
| `scripts/theme.test.mjs`, `scripts/contrast.test.mjs` | The token mapping, the generated theme files and the contrast checks |
| `scripts/vitepress-theme.test.mjs`, `scripts/css-selectors.test.mjs` | The VitePress theme against the tokens and the fixture (overrides, fonts, contrast pairs, double ring, brand-soft guard) and the CSS helpers |
| `scripts/fixtures/` | Captured data the tests read (an `npm pack` sample, the VitePress `2.0.0-alpha.20` fixture) and the workflow fixtures (`workflows/`) |
| `docs/development/index.md` | The checks on every pull request |

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

- Code in this repository: [MIT](LICENSE).
- Brand assets (the name "Keepia", the wordmark, the mark, lockups and app icons): all rights reserved, see the exceptions in [LICENSE](LICENSE).
