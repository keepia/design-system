// The VitePress theme (theme/vitepress.css): which Keepia Carbon token each VitePress
// variable gets, which colour pairs VitePress renders with them, and which VitePress
// rules for corners, focus and fonts are overridden or kept. scripts/build_vitepress.mjs
// writes theme/vitepress.css from it and theme/tokens.json; scripts/vitepress-theme.test.mjs
// checks the file against it, against theme/tokens.json and against the captured VitePress
// fixture.
//
// Ported from pklnx/design-system (keepia/mail#7, part 4) with these changes: the own
// variables are --keepia-vp-*; the accent is Teal through the same token map; there is no
// nav-title font rule (the products use the product lockup as the logo, with
// `siteTitle: false`); the fonts are the package's fonts/; the block icons are read from
// @carbon/icons instead of being rendered through @carbon/icons-react.
//
// Written for the VitePress version the products pin (VITEPRESS_VERSION); the fixture
// scripts/fixtures/vitepress-<version>.json is captured from that version's tarball by
// scripts/capture-vitepress-fixture.mjs.

export const VITEPRESS_VERSION = '2.0.0-alpha.20';

// ---------------------------------------------------------------- colours
// VitePress variable → Carbon token in tokens.json, per theme. 'transparent' is literal.
const T = (light, dark = light) => ({ light, dark });
const FAMILIES = ['tip', 'note', 'important', 'warning', 'caution', 'danger', 'success'];
const BLOCKS = {
  info: 'notification-background-info',
  note: 'notification-background-info',
  important: 'notification-background-info',
  tip: 'notification-background-success',
  warning: 'notification-background-warning',
  caution: 'notification-background-warning',
  danger: 'notification-background-error',
  details: 'layer-01',
};
// The left stripe of each custom-block kind (pklnx/design-system, maintainer decision on its
// PR #13): a 3 px border in Carbon's support colour, in both themes, like Carbon's inline
// notification. details gets none. The stripe is decorative (the block title carries the
// meaning), so it has no 3:1 contrast requirement and is not in PAIRS. The same holds for
// the 1 px frame and the icon below.
export const STRIPES = {
  info: 'support-info',
  note: 'support-info',
  important: 'support-info',
  tip: 'support-success',
  warning: 'support-warning',
  caution: 'support-warning',
  danger: 'support-error',
};
// Carbon's low-contrast inline notification also draws a 1 px frame in the support
// colour, through a ::before with `filter: opacity(0.4)` (@carbon/styles,
// scss/components/notification/_inline-notification.scss,
// inline-notification-low-contrast-before). Here the frame is the block's own 1 px border
// (VitePress's `.custom-block` border, coloured by --vp-custom-block-<kind>-border) in the
// support colour at alpha 0.4, which looks the same over the block ground.
export const FRAME_ALPHA = 0.4;
// The filled Carbon icon before each block title, as in the notification: the icon in
// the support colour, its inner path cut out, except WarningFilled, whose inner path
// Carbon fills black ($black-100). The build reads the 20 px icons from @carbon/icons
// (Apache-2.0), the source @carbon/icons-react is generated from; ICON_MODULES names each
// icon's module.
export const BLOCK_ICONS = {
  info: 'InformationFilled',
  note: 'InformationFilled',
  important: 'InformationFilled',
  tip: 'CheckmarkFilled',
  warning: 'WarningFilled',
  caution: 'WarningFilled',
  danger: 'ErrorFilled',
};
export const ICON_MODULES = {
  InformationFilled: '@carbon/icons/lib/information--filled/20.js',
  CheckmarkFilled: '@carbon/icons/lib/checkmark--filled/20.js',
  WarningFilled: '@carbon/icons/lib/warning--filled/20.js',
  ErrorFilled: '@carbon/icons/lib/error--filled/20.js',
};
export const FILLED_INNER = ['WarningFilled'];
// The elements VitePress renders for custom blocks: `::: kind` containers, GitHub-style
// alerts (`> [!NOTE]`, `<div class="note custom-block github-alert">`, five kinds) and
// `::: details` (a <details>).
const ALERTS = ['note', 'tip', 'important', 'warning', 'caution'];
export const CUSTOM_BLOCK_ELEMENTS = [
  ...Object.keys(STRIPES).map((kind) => ({ tag: 'div', classes: [kind, 'custom-block'] })),
  ...ALERTS.map((kind) => ({ tag: 'div', classes: [kind, 'custom-block', 'github-alert'] })),
  { tag: 'details', classes: ['details', 'custom-block'] },
];
const BADGES = {
  info: ['tag-background-gray', 'tag-color-gray'],
  note: ['tag-background-gray', 'tag-color-gray'],
  tip: ['tag-background-green', 'tag-color-green'],
  // Carbon's Blue tag; Teal stays for actions and links.
  important: ['tag-background-blue', 'tag-color-blue'],
  // Yellow only as an area with dark text (#161616 in both themes).
  warning: ['support-warning', T('text-primary', 'text-inverse')],
  caution: ['support-warning', T('text-primary', 'text-inverse')],
  danger: ['tag-background-red', 'tag-color-red'],
};
const BUTTONS = {
  brand: ['button-primary', 'button-primary-hover', 'button-primary-active'],
  alt: ['button-secondary', 'button-secondary-hover', 'button-secondary-active'],
};

export const MAP = {
  '--vp-c-bg': T('background'),
  '--vp-c-bg-alt': T('layer-01'),
  '--vp-c-bg-soft': T('layer-01'),
  // Menus and flyouts. Light stays white so the menu hover (default-soft) is visible.
  '--vp-c-bg-elv': T('background', 'layer-01'),
  '--vp-c-text-1': T('text-primary'),
  '--vp-c-text-2': T('text-secondary'),
  '--vp-c-text-3': T('text-helper'),
  '--vp-c-border': T('border-strong-01'),
  '--vp-c-divider': T('border-subtle-00'),
  '--vp-c-gutter': T('border-subtle-00'),
  '--vp-c-default-1': T('layer-active-01'),
  '--vp-c-default-2': T('layer-accent-01'),
  '--vp-c-default-3': T('layer-hover-01'),
  // Menu-link hover and the feature icon ground; code grounds are set separately.
  '--vp-c-default-soft': T('layer-01', 'layer-hover-01'),
  '--vp-c-brand-1': T('link-primary'),
  '--vp-c-brand-2': T('link-primary-hover'),
  '--vp-c-brand-3': T('button-primary'),
  // Teal 20 in White: brand-1 (Teal 60) on it is only 3.84:1, so no rule may paint brand-1
  // text on it (scripts/vitepress-theme.test.mjs, the brand-soft guard).
  '--vp-c-brand-soft': T('highlight'),
  // Links and code in links inside every block stay link colours; the semantic colour
  // sits in the block ground and the badge.
  ...Object.fromEntries(FAMILIES.flatMap((f) => [
    [`--vp-c-${f}-1`, T('link-primary')],
    [`--vp-c-${f}-2`, T('link-primary-hover')],
    [`--vp-c-${f}-3`, T('button-primary')],
  ])),
  '--vp-c-tip-soft': T('notification-background-success'),
  '--vp-c-note-soft': T('notification-background-info'),
  '--vp-c-important-soft': T('notification-background-info'),
  '--vp-c-warning-soft': T('notification-background-warning'),
  '--vp-c-caution-soft': T('notification-background-warning'),
  '--vp-c-danger-soft': T('notification-background-error'),
  '--vp-c-success-soft': T('notification-background-success'),
  ...Object.fromEntries(Object.entries(BUTTONS).flatMap(([kind, [bg, hover, active]]) => [
    [`--vp-button-${kind}-border`, T(bg)],
    [`--vp-button-${kind}-text`, T('text-on-color')],
    [`--vp-button-${kind}-bg`, T(bg)],
    [`--vp-button-${kind}-hover-border`, T(hover)],
    [`--vp-button-${kind}-hover-text`, T('text-on-color')],
    [`--vp-button-${kind}-hover-bg`, T(hover)],
    [`--vp-button-${kind}-active-border`, T(active)],
    [`--vp-button-${kind}-active-text`, T('text-on-color')],
    [`--vp-button-${kind}-active-bg`, T(active)],
  ])),
  ...Object.fromEntries(Object.entries(BADGES).flatMap(([kind, [bg, text]]) => [
    [`--vp-badge-${kind}-border`, T('transparent')],
    [`--vp-badge-${kind}-text`, typeof text === 'string' ? T(text) : text],
    [`--vp-badge-${kind}-bg`, T(bg)],
  ])),
  ...Object.fromEntries(Object.entries(BLOCKS).flatMap(([kind, bg]) => [
    // The 1 px frame (see FRAME_ALPHA); details has none.
    [`--vp-custom-block-${kind}-border`, STRIPES[kind] ? { ...T(STRIPES[kind]), alpha: FRAME_ALPHA } : T('transparent')],
    [`--vp-custom-block-${kind}-text`, T('text-primary')],
    [`--vp-custom-block-${kind}-bg`, T(bg)],
    // Inline code in blocks: a grey ground would fail 4.5:1 under link colours in light.
    [`--vp-custom-block-${kind}-code-bg`, T('background')],
  ])),
  // Carbon code-01; Teal is not used for decoration.
  '--vp-code-color': T('text-primary'),
  '--vp-code-bg': T('layer-01'),
  '--vp-code-link-color': T('link-primary'),
  '--vp-code-link-hover-color': T('link-primary-hover'),
  '--vp-code-block-color': T('text-primary'),
  '--vp-code-block-bg': T('layer-01'),
  '--vp-code-block-divider-color': T('border-subtle-00'),
  '--vp-code-lang-color': T('text-helper'),
  '--vp-code-line-number-color': T('text-helper'),
  '--vp-code-tab-divider': T('border-subtle-00'),
  '--vp-code-tab-text-color': T('text-secondary'),
  '--vp-code-tab-bg': T('layer-01'),
  '--vp-code-tab-hover-text-color': T('text-primary'),
  '--vp-code-tab-active-text-color': T('text-primary'),
  '--vp-code-tab-active-bar-color': T('border-interactive'),
  '--vp-code-copy-code-border-color': T('border-subtle-00'),
  '--vp-code-copy-code-bg': T('layer-01'),
  '--vp-code-copy-code-hover-border-color': T('border-strong-01'),
  '--vp-code-copy-code-hover-bg': T('layer-hover-01'),
  '--vp-code-copy-code-active-text': T('text-primary'),
  '--vp-local-search-bg': T('background'),
  '--vp-local-search-result-bg': T('layer-01'),
  '--vp-local-search-result-border': T('border-subtle-00'),
  '--vp-local-search-result-selected-bg': T('layer-01'),
  // The selected search result shows focus through this border (VPLocalSearchBox
  // keeps `.result { outline: none }`).
  '--vp-local-search-result-selected-border': T('border-interactive'),
  '--vp-local-search-highlight-bg': T('highlight'),
  '--vp-local-search-highlight-text': T('text-primary'),
  '--vp-nav-bg-color': T('background'),
  '--vp-nav-screen-bg-color': T('background'),
  '--vp-local-nav-bg-color': T('background'),
  '--vp-sidebar-bg-color': T('layer-01'),
  '--vp-home-hero-name-color': T('text-primary'),
  '--vp-input-border-color': T('border-strong-01'),
  '--vp-input-switch-bg-color': T('layer-01'),
  // Focus colours for the rules below (Carbon's focus and the inner ring of its
  // button focus).
  '--keepia-vp-focus': T('focus'),
  '--keepia-vp-focus-inset': T('focus-inset'),
  // Custom-block stripes (see STRIPES).
  ...Object.fromEntries(Object.entries(STRIPES).map(([kind, token]) => [`--keepia-vp-stripe-${kind}`, T(token)])),
};

// ---------------------------------------------------------------- DocSearch
// VitePress's Algolia search (styles/docsearch.css, loaded with the async VPAlgoliaSearchBox,
// which @imports @docsearch/css) paints three grounds with --vp-c-brand-soft through these
// variables, under brand-1 text: the hovered action and the sidepanel's submit button
// (--docsearch-soft-primary-color, with --docsearch-highlight-color / -primary-color text) and
// the keyboard-selected hit with its marked text (--docsearch-hit-highlight-color); the copied
// button uses --docsearch-success-color. Brand-1 never sits on brand-soft (3.84:1 in White), so
// these grounds get tokens brand-1 reads on (technical decision, keepia/mail#34): the hover
// ground is the page background (the search modal is layer-01), the selected hit is layer-01
// (the hits are the page background), the copied button Carbon's success notification ground.
// The fixture's @docsearch/css is the lowest version VitePress's ^4.7.0 range allows.
export const DOCSEARCH_CSS_VERSION = '4.7.0';
export const DOCSEARCH_MAP = {
  '--docsearch-soft-primary-color': T('background'),
  '--docsearch-hit-highlight-color': T('layer-01'),
  '--docsearch-success-color': T('notification-background-success'),
};
// styles/docsearch.css sets the DocSearch variables in `:root:root` (0,2,0), and it loads after
// this file, so the overrides need more specificity: (0,3,0), and (0,4,0) for G100.
export const DOCSEARCH_SELECTORS = { light: ':root:root:root', dark: ':root:root:root.dark' };
// The text pairs of those grounds, each with the DocSearch rules that render it (file and
// selector in the fixture). The test resolves them through every captured stylesheet.
const DS = '@docsearch/css/dist/style.css';
export const DOCSEARCH_PAIRS = [
  { fg: '--docsearch-highlight-color', on: '--docsearch-soft-primary-color', rules: [[DS, '.DocSearch-Action:hover'], [DS, '.DocSearch-AskAi-Return:hover']], where: 'hovered action' },
  { fg: '--docsearch-primary-color', on: '--docsearch-soft-primary-color', rules: [['styles/docsearch.css', '.DocSearch-Sidepanel-Prompt--submit']], where: 'sidepanel submit' },
  { fg: '--docsearch-highlight-color', on: '--docsearch-hit-highlight-color', rules: [[DS, '.DocSearch-Hit[aria-selected=true] a'], [DS, '.DocSearch-Hit[aria-selected=true] mark']], where: 'selected hit, marked text and action' },
  { fg: '--docsearch-text-color', on: '--docsearch-hit-highlight-color', rules: [[DS, '.DocSearch-Hit[aria-selected=true] .DocSearch-Hit-title']], where: 'selected hit title' },
  { fg: '--docsearch-highlight-color', on: '--docsearch-hit-background', rules: [[DS, '.DocSearch-Hit a']], where: 'marked text in a hit' },
];

// Custom properties that are not colours, the same in both themes. The font stacks are
// Carbon's (@carbon/type), passed in by the build.
export const staticProperties = (fonts) => ({
  '--vp-font-family-base': fonts.sans,
  '--vp-font-family-mono': fonts.mono,
  // No glow behind the hero image.
  '--vp-home-hero-image-background-image': 'none',
});

// ---------------------------------------------------------------- contrast
// Every foreground/background pair VitePress renders with the mapped variables, checked
// in both themes. min: 4.5 for text, 3 for non-text; the menu hover only has to be
// visibly different from the menu ground. brand-1 on brand-soft is not a pair: no rule
// renders it (the brand-soft guard in scripts/vitepress-theme.test.mjs keeps it so).
const B = (k) => `--vp-custom-block-${k}`;
const BLOCK_FAMILY = { info: 'brand', note: 'brand', details: 'brand', tip: 'tip', important: 'important', warning: 'warning', caution: 'caution', danger: 'danger' };
const PAGE = ['--vp-c-bg', '--vp-c-bg-alt', '--vp-c-bg-soft', '--vp-c-bg-elv'];
export const PAIRS = [
  { fg: '--vp-c-text-1', on: [...PAGE, '--vp-c-default-soft', '--vp-nav-bg-color', '--vp-sidebar-bg-color', '--vp-local-search-bg', '--vp-local-search-result-bg'], min: 4.5, where: 'text' },
  { fg: '--vp-c-text-2', on: [...PAGE, '--vp-sidebar-bg-color', '--vp-local-search-result-bg'], min: 4.5, where: 'secondary text' },
  { fg: '--vp-c-text-3', on: PAGE, min: 4.5, where: 'helper text' },
  { fg: '--vp-c-brand-1', on: [...PAGE, '--vp-c-default-soft', '--vp-sidebar-bg-color', '--vp-local-search-result-bg'], min: 4.5, where: 'links, active nav and menu link' },
  { fg: '--vp-c-brand-2', on: ['--vp-c-bg', '--vp-c-bg-alt', '--vp-c-bg-soft'], min: 4.5, where: 'link hover' },
  { fg: '--vp-home-hero-name-color', on: ['--vp-c-bg'], min: 4.5, where: 'hero name' },
  { fg: '--vp-c-default-soft', on: ['--vp-c-bg-elv'], min: 1.05, where: 'menu hover is visible' },
  ...['brand', 'brand-hover', 'brand-active', 'alt', 'alt-hover', 'alt-active'].map((b) => ({ fg: `--vp-button-${b}-text`, on: [`--vp-button-${b}-bg`], min: 4.5, where: `${b} button` })),
  ...Object.keys(BADGES).map((k) => ({ fg: `--vp-badge-${k}-text`, on: [`--vp-badge-${k}-bg`], min: 4.5, where: `${k} badge` })),
  ...Object.entries(BLOCK_FAMILY).flatMap(([k, fam]) => [
    { fg: `${B(k)}-text`, on: [`${B(k)}-bg`], min: 4.5, where: `${k} block text` },
    { fg: `--vp-c-${fam}-1`, on: [`${B(k)}-bg`, `${B(k)}-code-bg`], min: 4.5, where: `${k} block link, code in link` },
    { fg: `--vp-c-${fam}-2`, on: [`${B(k)}-bg`, `${B(k)}-code-bg`], min: 4.5, where: `${k} block link hover` },
    { fg: '--vp-code-color', on: [`${B(k)}-code-bg`], min: 4.5, where: `${k} block inline code` },
  ]),
  { fg: '--vp-code-color', on: ['--vp-code-bg'], min: 4.5, where: 'inline code' },
  { fg: '--vp-code-link-color', on: ['--vp-code-bg'], min: 4.5, where: 'code in a link' },
  { fg: '--vp-code-link-hover-color', on: ['--vp-code-bg'], min: 4.5, where: 'code in a link, hover' },
  { fg: '--vp-code-block-color', on: ['--vp-code-block-bg'], min: 4.5, where: 'code block' },
  { fg: '--vp-code-line-number-color', on: ['--vp-code-block-bg'], min: 4.5, where: 'line numbers' },
  { fg: '--vp-code-lang-color', on: ['--vp-code-block-bg'], min: 4.5, where: 'language label' },
  { fg: '--vp-code-tab-text-color', on: ['--vp-code-tab-bg'], min: 4.5, where: 'code-group tab' },
  { fg: '--vp-code-tab-hover-text-color', on: ['--vp-code-tab-bg'], min: 4.5, where: 'code-group tab, hover' },
  { fg: '--vp-code-tab-active-text-color', on: ['--vp-code-tab-bg'], min: 4.5, where: 'code-group tab, active' },
  { fg: '--vp-code-tab-active-bar-color', on: ['--vp-code-tab-bg'], min: 3, where: 'code-group active bar' },
  { fg: '--vp-code-copy-code-active-text', on: ['--vp-code-copy-code-hover-bg'], min: 4.5, where: 'copied label' },
  { fg: '--vp-local-search-highlight-text', on: ['--vp-local-search-highlight-bg'], min: 4.5, where: 'search match' },
  { fg: '--vp-local-search-result-selected-border', on: ['--vp-local-search-result-bg', '--vp-local-search-bg'], min: 3, where: 'selected search result border' },
  { fg: '--keepia-vp-focus', on: [...PAGE, '--vp-nav-bg-color', '--vp-sidebar-bg-color', '--vp-local-search-bg', '--vp-local-search-result-bg', '--vp-code-block-bg'], min: 3, where: 'focus ring' },
  { fg: '--keepia-vp-focus', on: ['--keepia-vp-focus-inset'], min: 3, where: 'the two rings of the button focus' },
];

// Carbon's button focus is a double ring: for each button state, the better of the two
// rings must reach 3:1 against the button.
export const RING_GROUNDS = ['brand', 'brand-hover', 'brand-active', 'alt', 'alt-hover', 'alt-active'].map((b) => `--vp-button-${b}-bg`);
export const RINGS = ['--keepia-vp-focus', '--keepia-vp-focus-inset'];

// ---------------------------------------------------------------- fonts
// URLs are relative to theme/vitepress.css and point into the package's fonts/ (written by
// scripts/build.mjs); Vite resolves them on the file system.
export const FONT_FACES = [
  { family: 'IBM Plex Sans', file: 'IBMPlexSans-Light.woff2', weight: '300', style: 'normal' },
  { family: 'IBM Plex Sans', file: 'IBMPlexSans-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'IBM Plex Sans', file: 'IBMPlexSans-Italic.woff2', weight: '400', style: 'italic' },
  // Declared for 600 and 700, so VitePress's bold does not get a synthesized face.
  { family: 'IBM Plex Sans', file: 'IBMPlexSans-SemiBold.woff2', weight: '600 700', style: 'normal' },
  { family: 'IBM Plex Mono', file: 'IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'IBM Plex Mono', file: 'IBMPlexMono-SemiBold.woff2', weight: '600 700', style: 'normal' },
];
export const FONT_DIR = '../fonts/';

// ---------------------------------------------------------------- overridden rules
// Every rule here covers the listed VitePress rules (file under
// dist/client/theme-default/, selector as written there). The tests check that each
// covered rule exists in the fixture, that one selector of the override targets the
// same element (its subject compound has every class of the VitePress subject and
// matches every element that subject matches) and that the override wins.
const at = (file, ...selectors) => selectors.map((selector) => ({ file, selector }));
const LANG = "div[class*='language-']";
const COPY = ".vp-doc [class*='language-'] > button.copy";

// Carbon is square. Every corner rule is `border-radius: 0 !important`: an unlayered
// !important declaration beats every normal declaration whatever its specificity, Vue
// scoping or load order (the async VPLocalSearchBox chunk loads after this file).
// Where VitePress itself uses !important, the selector is strictly more specific.
export const CORNERS = [
  { area: 'Buttons', selectors: ['.VPButton.medium', '.VPButton.big'], covers: at('components/VPButton.vue', '.VPButton.medium', '.VPButton.big') },
  { area: 'Badges', selectors: ['.VPBadge'], covers: at('components/VPBadge.vue', '.VPBadge') },
  { area: 'Custom blocks', selectors: ['.custom-block'], covers: at('styles/components/custom-block.css', '.custom-block') },
  { area: 'Custom blocks', selectors: [`.vp-doc .custom-block ${LANG}`, '.vp-doc .custom-block .vp-code-group .tabs'], covers: at('styles/components/vp-doc.css', `.vp-doc .custom-block ${LANG}`, '.vp-doc .custom-block .vp-code-group .tabs') },
  { area: 'Code', selectors: [`.vp-doc ${LANG}`, '.vp-block', `.vp-doc li ${LANG}`, '.vp-doc :not(pre) > code'], covers: at('styles/components/vp-doc.css', `.vp-doc ${LANG}`, '.vp-block', `.vp-doc li ${LANG}`, '.vp-doc :not(pre) > code') },
  { area: 'Code', selectors: [COPY, `${COPY}.copied`, `${COPY}.copied::before`], covers: at('styles/components/vp-doc.css', COPY, `${COPY}.copied`, `${COPY}:hover.copied`, `${COPY}.copied::before`, `${COPY}:hover.copied::before`) },
  { area: 'Code-group tabs', selectors: ['.vp-code-group .tabs', '.vp-code-group .tabs label::after'], covers: at('styles/components/vp-code-group.css', '.vp-code-group .tabs', '.vp-code-group .tabs label::after') },
  { area: 'Feature cards', selectors: ['.VPFeature', '.VPFeature .icon'], covers: at('components/VPFeature.vue', '.VPFeature', '.icon') },
  { area: 'Menus', selectors: ['.VPMenu'], covers: at('components/VPMenu.vue', '.VPMenu') },
  { area: 'Menus', selectors: ['.VPMenuLink .link'], covers: at('components/VPMenuLink.vue', '.link') },
  { area: 'Menus', selectors: ['.VPLocalNavOutlineDropdown .items'], covers: at('components/VPLocalNavOutlineDropdown.vue', '.items') },
  { area: 'Search', selectors: ['.VPNavBarSearchButton', '.VPNavBarSearchButton .keys'], covers: at('components/VPNavBarSearchButton.vue', '.VPNavBarSearchButton', '.keys') },
  {
    area: 'Search',
    selectors: ['.VPLocalSearchBox .shell', '.VPLocalSearchBox .search-bar', '.VPLocalSearchBox .result', '.VPLocalSearchBox .search-keyboard-shortcuts kbd', '.VPLocalSearchBox .titles mark', '.VPLocalSearchBox .excerpt mark'],
    covers: at('components/VPLocalSearchBox.vue', '.shell', '.search-bar', '.result', '.search-keyboard-shortcuts kbd', '.titles :deep(mark)', '.excerpt :deep(mark)'),
  },
  // VitePress: `.excerpt[data-v] .vp-code-group div[class*='language-']` (0,4,1) !important.
  { area: 'Search', selectors: [`.VPLocalSearchBox .excerpt.excerpt .vp-code-group ${LANG}`], covers: at('components/VPLocalSearchBox.vue', `.excerpt :deep(.vp-code-group) ${LANG}`) },
  { area: 'Other', selectors: ['.VPDocFooter .pager-link'], covers: at('components/VPDocFooter.vue', '.pager-link') },
  { area: 'Other', selectors: ['.VPNavScreenAppearance'], covers: at('components/VPNavAppearance.vue', '.VPNavScreenAppearance') },
  { area: 'Other', selectors: ['.VPSkipLink'], covers: at('components/VPSkipLink.vue', '.VPSkipLink') },
  { area: 'Other', selectors: ['.VPTeamMembersItem'], covers: at('components/VPTeamMembersItem.vue', '.VPTeamMembersItem') },
];

// Focus, inline code and custom-block stripes: normal declarations, unlayered. VitePress's
// base.css sits in @layer __vitepress_base, so these beat its rules at any
// specificity. `elements` describe the elements a rule is meant for; the tests check
// that the rule matches them and that every VitePress rule which sets the same
// property on them either loses or is kept below with a reason. There is no nav-title
// rule: the products show the product lockup as the logo, with `siteTitle: false`.
const RING = 'outline: 2px solid var(--keepia-vp-focus)';
export const RULES = [
  {
    area: 'Focus',
    note: 'Text links: a ring outside the text, so it never covers the glyphs.',
    selector: 'a:focus-visible',
    decls: [RING, 'outline-offset: 2px'],
    elements: [{ tag: 'a', attrs: { href: '/' } }],
  },
  {
    area: 'Focus',
    note: 'Controls: an inset ring, as on Carbon fields and icon buttons. Inside :where(), so every component rule outranks it; elements with tabindex="-1" are programmatic focus targets (the sidebar nav, headings after anchor navigation) and get no ring.',
    selector: ':where(button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])):focus-visible',
    decls: [RING, 'outline-offset: -2px'],
    covers: at('styles/base.css', 'button:focus', 'input:focus', 'textarea:focus', 'select:focus', 'button:focus-visible'),
    elements: [{ tag: 'button' }, { tag: 'input' }, { tag: 'select' }, { tag: 'textarea' }, { tag: 'summary' }, { tag: 'div', attrs: { tabindex: '0' } }],
  },
  {
    area: 'Focus',
    note: "Buttons: Carbon's button focus, a 2 px ring in focus with a 1 px inner ring in focus-inset (white on Teal 60 in light).",
    selector: '.VPButton:focus-visible',
    decls: ['outline: none', 'box-shadow: inset 0 0 0 2px var(--keepia-vp-focus), inset 0 0 0 3px var(--keepia-vp-focus-inset)'],
    elements: [{ tag: 'a', classes: ['VPButton', 'medium', 'brand'], attrs: { href: '/' } }, { tag: 'button', classes: ['VPButton', 'big', 'alt'] }],
  },
  {
    area: 'Code',
    note: "Inline code in custom blocks: keeps the code colour instead of the block's link colour; code inside links keeps the link colour. (0,2,2) beats `.custom-block.<kind> code` (0,2,1).",
    selector: '.vp-doc .custom-block :not(a) > code',
    decls: ['color: var(--vp-code-color)'],
    elements: [{ tag: 'code' }],
  },
  // Custom-block stripes. `.custom-block.custom-block.<kind>` (0,3,0) beats VitePress's
  // `.custom-block` frame (0,1,0) and `.custom-block.<kind> { border-color }` (0,2,0).
  ...Object.keys(STRIPES).map((kind, i) => ({
    area: 'Custom blocks',
    note: i === 0 ? "Custom blocks: a 3 px left stripe in Carbon's support colour, as on Carbon's inline notification. Decorative (the title carries the meaning), so no 3:1 requirement. details has none." : null,
    selector: `.custom-block.custom-block.${kind}`,
    decls: [`border-left: 3px solid var(--keepia-vp-stripe-${kind})`],
    covers: at('styles/components/custom-block.css', `.custom-block.${kind}`),
    elements: CUSTOM_BLOCK_ELEMENTS.filter((el) => el.classes[0] === kind),
  })),
];

// ---------------------------------------------------------------- kept rules
// VitePress rules that set a corner, an outline or a font, or a border on a custom
// block, and stay as they are (file, selector, the property kept, the reason). An
// outline rule that is not in a cascade layer carries the element it styles: the tests
// check that it still wins against every Keepia focus rule that matches that element.
// Kept rules without an element may still lose to a Keepia rule where one applies.
const keep = (file, selectors, property, reason, element) => selectors.map((selector) => ({ file, selector, property, reason, ...(element ? { element: element(selector) } : {}) }));
const UNUSED = 'component the products do not use';
export const KEPT = [
  ...keep('components/VPSwitch.vue', ['.VPSwitch', '.check', '.icon'], 'border-radius', "the appearance toggle; Carbon's toggle is round too"),
  ...keep('components/VPLocalSearchBox.vue', ['.search-loading'], 'border-radius', 'a spinner'),
  ...keep('components/VPHero.vue', ['.image-bg'], 'border-radius', 'hidden by --vp-home-hero-image-background-image: none'),
  ...keep('components/VPDocAsideOutline.vue', ['.outline-marker'], 'border-radius', 'a 2 px bar'),
  ...keep('components/VPSidebarItem.vue', ['.indicator'], 'border-radius', 'a 2 px bar'),
  ...keep('components/VPTeamMembersItem.vue', ['.avatar', '.avatar-img'], 'border-radius', 'avatar circle (radius-full)'),
  ...keep('components/VPCarbonAds.vue', ['.VPCarbonAds', '.VPCarbonAds :deep(img)'], 'border-radius', UNUSED),
  ...keep('components/VPNavBarAskAiButton.vue', ['.VPNavBarAskAiButton'], 'border-radius', `${UNUSED} (Algolia)`),
  ...keep('styles/components/vp-sponsor.css', ['.vp-sponsor', '.vp-sponsor.aside'], 'border-radius', UNUSED),
  ...keep('styles/docsearch.css', ['.DocSearch-Commands-Key', '.DocSearch-Menu-content', '.DocSearch-Menu-item'], 'border-radius', `${UNUSED} (Algolia)`),
  ...keep('styles/docsearch.css', ['.DocSearch-Hit a:focus-visible'], 'outline', `${UNUSED} (Algolia); sets its own ring`, () => ({ tag: 'a', attrs: { href: '/' } })),
  ...keep('components/VPLocalSearchBox.vue', ['.result'], 'outline', 'the selected result shows focus through --vp-local-search-result-selected-border (border-interactive)', () => ({ tag: 'a', classes: ['result', 'selected'], attrs: { href: '/' } })),
  ...keep('components/VPSidebar.vue', ['.nav'], 'outline', 'a programmatic skip-link target (tabindex="-1")', () => ({ tag: 'nav', classes: ['nav'], attrs: { id: 'VPSidebarNav', tabindex: '-1' } })),
  ...keep('styles/components/vp-doc.css', ['.vp-doc h1', '.vp-doc h2', '.vp-doc h3', '.vp-doc h4', '.vp-doc h5', '.vp-doc h6'], 'outline', 'headings focused by anchor navigation (the router sets tabindex="-1")', (s) => ({ tag: s.slice(-2), attrs: { id: 'x', tabindex: '-1' } })),
  ...keep('components/VPTeamMembersItem.vue', ['.sp .sp-link.link:hover', '.sp .sp-link.link:focus'], 'outline', UNUSED, () => ({ tag: 'a', classes: ['sp-link', 'link'], attrs: { href: '/' } })),
  ...keep('styles/base.css', [':-moz-focusring:where(:not(iframe))'], 'outline', "Firefox's default ring in @layer __vitepress_base; every Keepia focus rule is unlayered and replaces it where it applies"),
  ...keep('components/VPNavBarSearchButton.vue', ['kbd'], 'font-family', "inherits the search button's font"),
  ...keep('styles/base.css', ['button', 'input', 'select', 'optgroup', 'textarea', '::file-selector-button'], 'font', 'the preflight reset (font: inherit) in @layer __vitepress_base: form controls take the font of their parent, IBM Plex'),
  // Borders of custom blocks.
  ...keep('styles/components/custom-block.css', ['.custom-block'], 'border', 'the 1 px transparent frame of every block; the stripe rules replace its left side, details keeps it whole'),
  ...keep('styles/components/custom-block.css', ['.custom-block.details'], 'border-color', 'details has no stripe; --vp-custom-block-details-border is transparent'),
  ...keep('styles/base.css', ['*'], 'border', 'the preflight reset (border: 0 solid) in @layer __vitepress_base'),
];

// The properties whose VitePress rules are overridden or kept, by what they set. The first
// property of each group is the one theme/vitepress.css sets; the others are its longhands
// (for fonts, the font shorthand) that a VitePress rule could set instead, and the first one
// overrides them.
export const CLASSIFIED_GROUPS = {
  corner: ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'border-start-start-radius', 'border-start-end-radius', 'border-end-start-radius', 'border-end-end-radius'],
  outline: ['outline', 'outline-style', 'outline-width'],
  font: ['font-family', 'font'],
};
export const CLASSIFIED = Object.values(CLASSIFIED_GROUPS).flat();

// Values that already equal what the overrides set, so their rules need no entry.
export const isTargetValue = (property, value) =>
  (CLASSIFIED_GROUPS.corner.includes(property) && /^0(px|rem|%)?$/.test(value.trim()))
  || (property === 'font-family' && /^var\(--vp-font-family-(base|mono)\)$/.test(value.trim()));

// ---------------------------------------------------------------- the stylesheet
const block = (selector, props) => `${selector} {\n${Object.entries(props).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

// '#0043ce', 0.4 → 'rgba(0, 67, 206, 0.4)'.
export function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`vitepress-map: not a 6-digit hex colour: ${hex}`);
  return `rgba(${[0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(', ')}, ${alpha})`;
}

// The Apache-2.0 notice inside each icon's SVG. Minifiers keep the value of a url() (esbuild
// byte for byte; Lightning CSS drops the quotes and escapes the parentheses), so unlike
// LEGAL_COMMENT it reaches the products' minified docs builds.
export const iconNotice = (name) => `<!-- Carbon icon ${name} (@carbon/icons), Copyright IBM Corp., Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0 -->`;

// The icon custom properties for one theme: a data: SVG per block kind. shapes: the
// icon name → { viewBox, outer, inner } from @carbon/icons; black: Carbon's $black-100
// for the filled inner path.
export function iconProperties(tokens, theme, shapes, black) {
  return Object.fromEntries(Object.entries(BLOCK_ICONS).map(([kind, name]) => {
    const shape = shapes[name];
    if (!shape) throw new Error(`vitepress-map: icon ${name} missing`);
    const fill = tokens[theme][STRIPES[kind]];
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}">${iconNotice(name)}<path fill="${fill}" d="${shape.outer}"/>`;
    if (FILLED_INNER.includes(name)) svg += `<path fill="${black}" d="${shape.inner}"/>`;
    svg += '</svg>';
    return [`--keepia-vp-icon-${kind}`, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`];
  }));
}

// 20 px, as Carbon's notification icon, centred on the 14 px title line.
export const ICON_GEOMETRY = [
  'content: ""',
  'display: inline-block',
  'width: 1.25rem',
  'height: 1.25rem',
  'margin-inline-end: 0.5rem',
  'vertical-align: -0.3125rem',
  'background-repeat: no-repeat',
  'background-position: center',
  'background-size: contain',
];
export const ICON_BEFORE = (kind) => `.custom-block.${kind} > .custom-block-title::before`;

// Resolves MAP (or another map of the same shape) for one theme against tokens.json.
export function themeValues(tokens, theme, map = MAP) {
  return Object.fromEntries(Object.entries(map).map(([name, t]) => {
    const token = t[theme];
    if (token === 'transparent') return [name, 'transparent'];
    const v = tokens[theme][token];
    if (!v) throw new Error(`vitepress-map: token ${token} missing in ${theme}`);
    return [name, t.alpha === undefined ? v : withAlpha(v, t.alpha)];
  }));
}

// The notice of the Carbon icons in the CSS, as a /*! legal comment at the start of the file
// (Lightning CSS keeps only a leading one). It reaches unminified builds and builds whose
// minifier keeps legal comments. The products' VitePress build (Vite 8) drops it: its CSS
// minifier is Lightning CSS, and this file is not first in VitePress's single CSS bundle
// (with esbuild, Vite 8 sets legalComments: 'none'). There, the notice inside each icon
// (iconNotice) carries it.
export const LEGAL_COMMENT = `/*! The custom-block icons are Carbon icons (@carbon/icons),
   Copyright IBM Corp., Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0 */`;

// The text of theme/vitepress.css. tokens: theme/tokens.json; fonts: { sans, mono };
// icons: { shapes, black } (see iconProperties).
export function vitepressCss(tokens, fonts, icons) {
  const statics = staticProperties(fonts);
  let css = `${LEGAL_COMMENT}
/* Keepia VitePress theme: VitePress ${VITEPRESS_VERSION} default theme with the Keepia Carbon tokens,
   IBM Plex, Carbon corners and focus. Import after vitepress/theme-without-fonts.
   Generated by scripts/build_vitepress.mjs from theme/tokens.json and scripts/vitepress-map.mjs. Do not edit. */
`;
  css += block(':root', { ...themeValues(tokens, 'light'), ...statics, ...iconProperties(tokens, 'light', icons.shapes, icons.black) });
  css += block('.dark', { ...themeValues(tokens, 'dark'), ...statics, ...iconProperties(tokens, 'dark', icons.shapes, icons.black) });
  css += '/* DocSearch (Algolia search): no brand-1 text on brand-soft; see DOCSEARCH_MAP in scripts/vitepress-map.mjs. */\n';
  for (const theme of ['light', 'dark']) css += block(DOCSEARCH_SELECTORS[theme], themeValues(tokens, theme, DOCSEARCH_MAP));
  for (const f of FONT_FACES) {
    css += block('@font-face', {
      'font-family': `"${f.family}"`,
      src: `url("${FONT_DIR}${f.file}") format("woff2")`,
      'font-weight': f.weight,
      'font-style': f.style,
      'font-display': 'swap',
    });
  }
  css += '/* Corners: Carbon is square. */\n';
  for (const c of CORNERS) css += `${c.selectors.join(',\n')} {\n  border-radius: 0 !important;\n}\n`;
  for (const r of RULES) css += `${r.note ? `/* ${r.note.replace(/\*\//g, '* /')} */\n` : ''}${r.selector} {\n${r.decls.map((d) => `  ${d};`).join('\n')}\n}\n`;
  css += "/* Custom-block icons: Carbon's filled notification icon before the title, in the support colour. The title stays on its own line. */\n";
  css += `${Object.keys(BLOCK_ICONS).map(ICON_BEFORE).join(',\n')} {\n${ICON_GEOMETRY.map((d) => `  ${d};`).join('\n')}\n}\n`;
  for (const kind of Object.keys(BLOCK_ICONS)) css += `${ICON_BEFORE(kind)} {\n  background-image: var(--keepia-vp-icon-${kind});\n}\n`;
  return css;
}
