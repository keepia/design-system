# Keepia design system

The brand of Keepia (Mail, Docs and Archive): **IBM Carbon v11 with Teal as the interactive colour**, the mark and the wordmark `keepia` in IBM Plex Sans.

This repository holds the Carbon theme and tokens for White and G100, the logo, lockups, app icons and favicons, and a VitePress theme for the products' documentation, released as an npm-format tarball on a GitHub release. The work is planned in [keepia/mail#7](https://github.com/keepia/mail/issues/7) and tracked there. Part 1 set up the repository; part 2 added the Carbon theme, the tokens and the contrast checks (see Theme); part 4 added the VitePress theme (see VitePress); part 3 added the logo, lockups, app icons and favicons (see Logo); part 5 added the package and the release workflow (see Package and Releasing). Nothing is released yet: the first release, `v0.1.0`, waits for the maintainer's OK.

**Status: in development.**

## Package

The package is released as an npm-format tarball attached to a [GitHub release](https://github.com/keepia/design-system/releases) of this repository. It is not on the npm registry and not on GitHub Packages: the asset is public and needs no account or token, also in Docker builds.

### Install

```sh
pnpm add https://github.com/keepia/design-system/releases/download/vX.Y.Z/keepia-design-system-X.Y.Z.tgz
```

pnpm records the URL and the tarball's sha512 integrity in `pnpm-lock.yaml`; a changed asset fails `pnpm install --frozen-lockfile`.

**Never run `pnpm add @keepia/design-system` (or `npm install @keepia/design-system`) without the URL.** The bare name asks the npm registry, where the name is not ours: it is not taken today, so anyone could register it. `"private": true` in `package.json` keeps this package off the registry.

### Use

CSS: load it after Carbon's CSS and put `cds--white` or `cds--g100` on `<html>` (see Theme). Sass goes through the `sass` export condition, which Sass tooling (Vite, sass-loader, Dart Sass's `pkg:` importer) sets; a plain JS `import` of `@keepia/design-system/theme` fails with a resolution error. The VitePress theme is in VitePress, the logo files in Logo.

| Export | File |
| --- | --- |
| `@keepia/design-system/theme/keepia-carbon.css` | The Carbon theme: the tokens that differ from Carbon, set for `.cds--white` and `.cds--g100` alike, each with its theme's value |
| `@keepia/design-system/theme/vitepress.css` | The VitePress theme for the products' docs, see VitePress |
| `@keepia/design-system/theme` | The Sass module (`theme/_index.scss`), only under the `sass` condition |
| `@keepia/design-system/theme/tokens.json` | Every Carbon colour token for White and G100 after the customization, plus the `changed` set |
| `@keepia/design-system/fonts/*` | The IBM Plex woff2 files and `OFL.txt` |
| `@keepia/design-system/brand/*` | The marks, wordmarks, lockups, app icons and favicons (see Logo, Files) |
| `@keepia/design-system/package.json` | The manifest |

- **Peer dependency**: `@carbon/styles` `^1.118.0`, needed for `keepia-carbon.css` and the Sass module. It is optional (`peerDependenciesMeta`), so a docs site that only uses `vitepress.css` does not install Carbon. The package has no dependencies of its own and no install scripts.
- **Fonts**: `keepia-carbon.css` has no `@font-face` rules; a consumer writes its own, for example `src: url("@keepia/design-system/fonts/IBMPlexSans-Regular.woff2") format("woff2")`. `vitepress.css` brings its own.
- **Contents**: exactly the files above plus `LICENSE`, `README.md` and `THIRD_PARTY_NOTICES.md`, 67 files. The brand files ship (keepia/mail#7, maintainer decision M2); the sign-off sheets (`brand/preview-*`), their build record (`brand/manifest.json`), the build inputs (`theme/brand.json`, `theme/logo-geometry.json`), `theme/contrast-report.json`, the scripts and the dev dependencies (among them `lightningcss`) do not. `scripts/check-pack.mjs` enforces the list in CI and in the release.
- **Consumer smoke test**: `scripts/consumer.test.mjs` (part of `npm test`) packs the package as the release does, installs the tarball into an empty project with `npm install --offline`, resolves every export, compiles `@use 'pkg:@keepia/design-system/theme'` with Carbon and parses the CSS files. It needs no network.
- **License**: `MIT, brand marks excepted`. The code is MIT; the brand assets (the name, the marks, wordmarks, lockups, app icons and favicons in `brand/`) are all rights reserved, see the exceptions in [LICENSE](LICENSE). The token values are computed from Carbon (Apache-2.0) and the fonts are IBM Plex (SIL Open Font License 1.1); `THIRD_PARTY_NOTICES.md` carries their notices. The string is not an SPDX expression, on purpose: no SPDX identifier covers the brand exception.

## Building

Node 26, as declared in `.node-version`: the one place for the version. The workflows read it through the local action `.github/actions/setup` (`actions/setup-node` with `node-version-file`, then `npm ci --ignore-scripts`), `scripts/workflows.test.mjs` checks that nothing else names a Node version, and `devEngines` in `package.json` makes npm warn on an older Node when you work in this repository. `devEngines` (unlike `engines`) is ignored when the package is installed as a dependency, so the tarball puts no requirement on consumers.

```sh
npm ci --ignore-scripts   # no install scripts, as in CI
npm run build:all         # every generated file, in the order below
npm test                  # all tests (no network), the consumer smoke test included
npm pack --dry-run --json --ignore-scripts | node scripts/check-pack.mjs   # the package contents
```

`npm run build:all` (`scripts/build_all.mjs`) is the one place that defines the order of the generation steps. It runs these commands, in this order, and stops at the first one that fails:

```sh
node scripts/build.mjs
node scripts/build_vitepress.mjs
node scripts/build_logo.mjs
node scripts/build_previews.mjs
node scripts/render_pngs.mjs
```

- `scripts/build.mjs` writes `theme/keepia-carbon.css`, `theme/_index.scss`, `theme/tokens.json`, `theme/contrast-report.json`, `fonts/` and `THIRD_PARTY_NOTICES.md` from `theme/brand.json` and the installed Carbon and IBM Plex packages.
- `scripts/build_vitepress.mjs` writes `theme/vitepress.css` from `theme/tokens.json` and `scripts/vitepress-map.mjs` (see VitePress).
- `scripts/build_logo.mjs` writes `theme/logo-geometry.json` and the brand SVGs in `brand/` from the logo section of `theme/brand.json`, the colours in `theme/tokens.json` and IBM Plex Sans (outlined with `opentype.js`).
- `scripts/build_previews.mjs` writes the sign-off sheets `brand/preview-*.svg` from the brand SVGs.
- `scripts/render_pngs.mjs` renders every PNG in `brand/` with resvg, writes `brand/favicon.ico` and `brand/manifest.json`.

`@resvg/resvg-js` and `opentype.js` are pinned exactly, because their output is committed and compared.

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

With Dart Sass alone, `@use 'pkg:@keepia/design-system/theme'` and the `NodePackageImporter` reach the module the same way. The exports are in Package.

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

The file's `:root` and `.dark` blocks must come after VitePress's own, so it is imported after the VitePress theme. In `docs/.vitepress/config.mts`, the logo is the product lockup, one file per theme, and the favicon is the mark (the lockup and favicon files are in `brand/`, see Logo):

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

**Contrast.** `scripts/vitepress-theme.test.mjs` checks every colour pair VitePress renders with the mapped variables (pklnx's `PAIRS`, more than 200 pairs over both themes) and Carbon's double focus ring on every button state. `PAIRS`, the ring lists and the token map are pinned to pklnx's (the same JSON apart from the prefix). White `--vp-c-brand-1` on `--vp-c-brand-soft` (Teal 60 on Teal 20) is only 3.84:1, so it is not a pair, and no rule may render it: the brand-soft guard resolves every `color` and `background` declaration of the captured stylesheets (VitePress's theme and the files of `@docsearch/css` that VitePress's `docsearch.css` imports, at 4.7.0, the lowest version alpha.20's range `^4.7.0` allows; a fresh install resolves a later 4.7.x, and the products' lockfile decides which one their docs get) and of `theme/vitepress.css` through the custom properties of all of them, with the cascade, and fails when a rule paints brand-1 text on, inside, below or next to a brand-soft ground, or when a colour value does not resolve. Its limits are listed in the test.

**DocSearch.** With Algolia search, VitePress's `docsearch.css` puts brand-soft under brand-1 text in three places: the hovered action, the sidepanel's submit button and the keyboard-selected hit with its marked text. `theme/vitepress.css` therefore sets three DocSearch variables, in `:root:root:root` and `:root:root:root.dark` (more specific than VitePress's `:root:root`, which loads later with the search box): `--docsearch-soft-primary-color` is `background` (brand-1 on it 4.99:1 in White, 7.75:1 in G100), `--docsearch-hit-highlight-color` is `highlight`, the Teal ground of the selected hit, and `--docsearch-success-color` is `notification-background-success` (text-secondary icon 7.09:1 and 8.86:1). On the Teal ground the brand-1 text becomes text-primary (keepia/mail#37): `theme/vitepress.css` sets `--docsearch-highlight-color` on `.DocSearch-Hit[aria-selected=true]` (marked text, action, icon) and `--docsearch-sidepanel-accent` on `.DocSearch-Sidepanel-RecentConversation` (action and icon when hovered or focused) to `--vp-c-text-1`, and the descendants inherit it. Text-primary on `highlight` is 13.94:1 and 13.73:1, text-secondary 6.02:1 and 8.84:1. The other hits and the hovered action keep brand-1. `DOCSEARCH_PAIRS` in `scripts/vitepress-map.mjs` lists every text on these grounds.

When the products move to another VitePress version, capture its fixture (see the header of `scripts/capture-vitepress-fixture.mjs`), set `VITEPRESS_VERSION` in `scripts/vitepress-map.mjs` and run `npm test`. Every new VitePress rule that sets a corner, an outline or a font fails the tests until `scripts/vitepress-map.mjs` overrides it or keeps it with a reason.

## Logo

The mark is a latch: a white bar, a tongue that stops short of it and a chevron, on a Teal 60 tile (keepia/mail#7, maintainer decision 6807193549, "R3"). The wordmark is `keepia` in IBM Plex Sans SemiBold with −1 % tracking; product lockups add the product name in Plex Sans Regular in `text-secondary`. Mail, Docs and Archive share mark and colour.

All files are generated from one source (README, Building): the primitives on a 32-unit grid in `theme/brand.json`. `scripts/build_logo.mjs` turns the chevron, a stroke there, into one filled polygon and writes it with the outlined text to `theme/logo-geometry.json`; every file in `brand/` is drawn from that. The SVGs carry no text, fonts, strokes, styles, scripts, links, gradients, filters or images, so they render the same everywhere.

![Keepia logo on White](brand/preview-white.png)

![Keepia logo on G100](brand/preview-g100.png)

![Keepia app icons and favicons](brand/preview-icons.png)

The sheets are generated (`brand/preview-*.svg`, rendered to PNG at 1 px per unit, so the favicon rasters show at their real size).

### Files

| File | Use |
| --- | --- |
| `brand/keepia-mark.svg`, `brand/favicon.svg` | The tile with the white mark (the app icon, the favicon) |
| `brand/keepia-mark-{teal,black,white}.svg` | The mark without tile, in one colour |
| `brand/keepia-wordmark-{light,dark,black,white}.svg` | The wordmark alone |
| `brand/keepia-lockup-{light,dark,black,white}.svg`, `brand/keepia-lockup-stacked-…` | Tile and wordmark, side by side or stacked |
| `brand/keepia-{mail,docs,archive}-lockup-…` | Product lockups, the same variants |
| `brand/favicon.ico` | 16, 32 and 48 px; `brand/favicon-{16,32,48}.png` are the same images |
| `brand/icon-192.png`, `brand/icon-512.png` | Web app manifest, `"purpose": "any"` |
| `brand/icon-maskable-512.png` (`icon-maskable.svg`) | Web app manifest, `"purpose": "maskable"`: full-bleed Teal, the mark inside the safe circle |
| `brand/apple-touch-icon.png` (180 px, `apple-touch-icon.svg`) | iOS home screen; full bleed, iOS rounds the corners |
| `brand/icon-1024.png` | The opaque master for iOS and macOS app icons; per-platform sets wait for a native app |
| `brand/manifest.json` | Every PNG with its size, its source SVG and both sha256 sums |

`light` is for the White theme (wordmark `text-primary` `#161616`), `dark` for G100 (`#f4f4f4`); `black` and `white` are single colour, with the mark without its tile. In HTML:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

The brand files are in the package (keepia/mail#7, maintainer decision M2), all but the sign-off sheets and `manifest.json`, for example `node_modules/@keepia/design-system/brand/keepia-mail-lockup-light.svg` or `import lockup from '@keepia/design-system/brand/keepia-mail-lockup-light.svg'`. They are brand assets, all rights reserved (LICENSE, Exceptions), not covered by the MIT License.

### Usage rules

- **Clear space:** keep free space of one bar width (5/32 of the tile edge) around the logo, outside the tile or the lockup, on every side. The sheets show it as a frame.
- **Minimum size:** the tile 16 px. At 16 px the gap between bar and tongue is still one pixel column of the tile colour (tested).
- **Tile colour:** Teal 60 (`background-brand`) in both themes. In G100 place the tile only on `background` or `layer-01` (3.63:1 and 3.03:1). On `layer-02` and higher layers it reaches only 2.32:1: use the white mark without tile there.
- **Single colour:** the mark without tile in Teal 60, black or white; single-colour lockups in black or white.
- **Do not** recolour the tile per product, add gradients, shadows or outlines, rotate or stretch the mark, set the wordmark in live text in place of the files, or change the spacing in a lockup.

## Releasing

### Verify a release

```sh
gh release download vX.Y.Z --repo keepia/design-system
sha256sum -c SHA256SUMS            # or on macOS: shasum -a 256 -c SHA256SUMS
gh attestation verify keepia-design-system-X.Y.Z.tgz --repo keepia/design-system \
  --signer-workflow keepia/design-system/.github/workflows/release.yml \
  --source-ref refs/heads/main
```

The integrity in the consumer's `pnpm-lock.yaml` must equal:

```sh
echo "sha512-$(openssl dgst -sha512 -binary keepia-design-system-X.Y.Z.tgz | openssl base64 -A)"
```

The release notes print the install command and this integrity, too.

The release workflow runs only on `main` and creates the tag itself, on the commit it built. The attestation records the ref the workflow ran on, so `--source-ref refs/heads/main` fails for a tarball built from any other ref. When you update a consumer, also check that the release's commit is on `main`: `git merge-base --is-ancestor vX.Y.Z origin/main` in a clone of this repository.

### Version policy

[Semantic versioning](https://semver.org/):

- **Major**: a new Carbon major, a removed or renamed token, a removed export or export condition, a removed brand file.
- **Minor**: new tokens, exports or brand files, changed token values, a changed logo.
- **Patch**: anything else.

While the version is 0.x, a breaking change bumps the minor version.

### Updating a consumer

Dependabot does not update URL dependencies. Each release gets a small pull request in each consumer:

1. `pnpm add https://github.com/keepia/design-system/releases/download/vX.Y.Z/keepia-design-system-X.Y.Z.tgz`
2. Verify the release as above, including that its commit is on `main`.
3. The review checks that the integrity in `pnpm-lock.yaml` equals the integrity of the verified tarball.

No release-age delay (`minimumReleaseAge`) applies: it only covers registry packages.

### Releasing

Releases are planned in keepia/mail milestones, and releasing needs the maintainer's OK (`CLAUDE.md`, Ticket flow, step 8).

1. Every issue of the release's milestone is closed and CI on `main` is green.
2. `version` in `package.json` is the milestone title (a pull request bumps it).
3. Actions → Release → Run workflow, on `main`. The "dry run" box is ticked by default: such a run shows the tarball, `SHA256SUMS` and the notes in its summary and releases nothing ("dry run, nothing released" in the log and the summary). For the real release, **untick the box**; the run then says "releasing".

Nobody pushes a tag: `.github/workflows/release.yml` creates the tag `vX.Y.Z` together with the release, on the `main` commit it built. It checks that it runs on `main`, that the `package.json` version is `X.Y.Z` and that neither the tag nor a release `vX.Y.Z` exists yet, then regenerates every file with `npm run build:all` and fails on any difference, runs the tests (the consumer smoke test among them) and the package check, packs the tarball and writes `SHA256SUMS` and the notes. Unless it is a dry run, it then attests the tarball, creates the tag through the API (which fails if the tag exists, so a tag pushed in the meantime is never reused) and creates the release on it. A failed check stops the workflow before anything is attested or published; a run started from any other ref than `main` fails in its first step. If creating the release fails or the job is cancelled, the workflow removes the tag it created (and a draft release gh left behind), so the next run starts over; should a tag remain without a release anyway, delete it before the next run; a published release and its tag are never removed. A release that exists is never replaced: running the workflow again for the same version fails, so the next release needs a version bump. The token diff in the notes compares against the newest `v*` tag on `main` before the released commit. If the build fails with `No tags can describe …`, a `v*` tag exists that is not on `main`: delete that stray tag and run the workflow again.

The jobs that hold write tokens (`attest`: `id-token` and `attestations`; `release`: `contents`) only download the built tarball, check its checksum, attest it and call `gh`; they run no repository or dependency code, are skipped in a dry run, and run only after the jobs before them succeeded (`release` needs `build` and `attest`; neither job nor any of its steps may `continue-on-error`). `scripts/workflow-rules.mjs` checks this (rule `release-job`, see [docs/development/index.md](docs/development/index.md)).

What protects a release is the `main`-only check plus the permission to run the workflow: only people with write access to this repository can start it. Anyone with write access can also push to `main` or start the workflow from a branch with a changed `release.yml`; the second case shows up in the attestation, which then does not name `refs/heads/main`.

## Layout

| Path | Contents |
| --- | --- |
| `.node-version` | The Node major for development and CI (workflows, `devEngines`, tests); see Building |
| `.github/workflows/ci.yml` | The `check` job: generated files are committed, `npm test`, package contents |
| `.github/workflows/secrets.yml` | The `secret-scan` job: gitleaks on the commits a pull request or a push to `main` adds |
| `.github/workflows/release.yml` | The release, started by hand on `main`: build, checks, pack, attest, tag and release (see Releasing) |
| `.github/actions/setup/` | The composite action with the Node and `npm ci` steps and the only pin of `actions/setup-node` |
| `.github/dependabot.yml` | Weekly version updates with a 14-day cooldown for npm, GitHub Actions (workflows and the composite action) and Go (`tools/gitleaks`) |
| `.gitleaks.toml`, `Makefile`, `scripts/secret-scan-*.sh` | The secret scan, taken from keepia/mail |
| `tools/gitleaks/go.mod` | Only the Go version the secret scan builds gitleaks with; this repository has no Go code |
| `theme/brand.json` | The brand input: the Carbon hue that replaces Blue, and the logo primitives and layout |
| `theme/logo-geometry.json` | The logo geometry derived from `theme/brand.json` (chevron outline, outlined text, lockup layout) |
| `brand/` | The generated logo files and the sign-off sheets (see Logo) |
| `theme/keepia-carbon.css`, `theme/_index.scss`, `theme/tokens.json`, `theme/contrast-report.json` | The generated theme (see Theme) |
| `fonts/` | IBM Plex Sans and Mono (woff2) with `OFL.txt`, copied from the npm packages |
| `THIRD_PARTY_NOTICES.md` | The packages whose values or files ship, with their licence texts |
| `theme/vitepress.css` | The generated VitePress theme (see VitePress) |
| `scripts/build.mjs` | Generates the theme, fonts and notices |
| `scripts/build_vitepress.mjs` | Generates `theme/vitepress.css` from `theme/tokens.json`, `@carbon/type` and `@carbon/icons` |
| `scripts/vitepress-map.mjs` | The VitePress theme: variable → token map, the contrast pairs, the overridden and the kept VitePress rules |
| `scripts/css-selectors.mjs` | CSS parsing, specificity and selector matching for the VitePress tests and the capture |
| `scripts/capture-vitepress-fixture.mjs` | Captures `scripts/fixtures/vitepress-<version>.json` from the VitePress npm package, run by hand; the tests read the fixture |
| `scripts/build_logo.mjs`, `scripts/build_previews.mjs`, `scripts/render_pngs.mjs`, `scripts/png.mjs` | Generate the logo files, the sign-off sheets, the PNGs and `favicon.ico` |
| `scripts/logo.test.mjs` | The logo tests: geometry, pixel equivalence, 16 px gap, hygiene and colours, lockups, freshness, icons, contrast |
| `scripts/contrast.mjs` | The contrast pairs and the WCAG 2.x ratio |
| `scripts/build_all.mjs` | `npm run build:all`: the one entry point for all generation steps (see Building) |
| `scripts/check-pack.mjs` | Fixes the package contents, file by file, and forbids lifecycle scripts |
| `scripts/release-notes.mjs` | The release notes: install command, integrity, verify commands, token diff against the previous release |
| `scripts/consumer.test.mjs` | The consumer smoke test: pack, offline install into an empty project, exports, Sass, CSS (see Package) |
| `scripts/workflow-rules.mjs`, `scripts/workflows.test.mjs` | The rules every workflow follows (parsed YAML): pins, permissions, triggers, required jobs, `run` without `${{ }}`, npm, checkouts, the Node prelude, Dependabot |
| `scripts/*.test.mjs` | The tests, run by `npm test` (no network) |
| `scripts/theme.test.mjs`, `scripts/contrast.test.mjs` | The token mapping, the generated theme files and the contrast checks |
| `scripts/vitepress-theme.test.mjs`, `scripts/css-selectors.test.mjs` | The VitePress theme against the tokens and the fixture (overrides, fonts, contrast pairs, double ring, brand-soft guard) and the CSS helpers |
| `scripts/fixtures/` | Captured data the tests read (an `npm pack` sample, the VitePress `2.0.0-alpha.20` fixture, two token files for the release notes) and the workflow fixtures (`workflows/`) |
| `docs/development/index.md` | The checks on every pull request |

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

- Code in this repository: [MIT](LICENSE).
- Brand assets (the name "Keepia", the wordmark, the mark, lockups, app icons and favicons): all rights reserved, see the exceptions in [LICENSE](LICENSE). They ship in the package all the same, which is why its `license` is `MIT, brand marks excepted`.
