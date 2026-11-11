// The contrast pairs of the Keepia Carbon theme and their evaluation (keepia/mail#7, part 2).
// scripts/build.mjs writes theme/contrast-report.json with evaluate(); scripts/contrast.test.mjs
// fails `npm test` on the same evaluation.
//
// Ratios are WCAG 2.x: relative luminance with the sRGB transfer of pklnx/design-system's
// scripts/build.mjs (threshold 0.03928), then (L1 + 0.05) / (L2 + 0.05). The minimum is 4.5:1 for
// text and 3:1 for non-text UI (focus rings, borders, icons, the logo tile).

export const TEXT = 4.5;
export const UI = 3;

// Relative luminance of a #rrggbb colour; null for anything else (rgba() tokens are not rated).
export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio of two #rrggbb colours; null when either is not one.
export function ratio(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  if (x == null || y == null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const round2 = (r) => Math.round(r * 100) / 100;

// [foreground, grounds, minimum]. The first block is pklnx/design-system's list
// (scripts/build.mjs:78-95) without its `star` pair; the rest are added for Keepia.
export const PAIRS = [
  ['text-primary', ['background', 'layer-01', 'layer-02', 'field-01'], TEXT],
  ['text-secondary', ['background', 'layer-01', 'layer-02', 'field-01'], TEXT],
  ['text-helper', ['background', 'layer-01', 'layer-02'], TEXT],
  ['text-error', ['background', 'layer-01'], TEXT],
  ['link-primary', ['background', 'layer-01', 'layer-02'], TEXT],
  ['link-primary-hover', ['background', 'layer-01'], TEXT],
  // The white mark on the logo tile is `text-on-color` on `background-brand`.
  ['text-on-color', ['button-primary', 'button-primary-hover', 'background-brand', 'button-danger-primary'], TEXT],
  ['focus', ['background', 'layer-01', 'layer-02'], UI],
  ['border-strong-01', ['background', 'layer-01'], UI],
  ['icon-primary', ['background', 'layer-01'], UI],
  ['icon-secondary', ['background', 'layer-01'], UI],
  ['support-success', ['background', 'layer-01'], UI],
  ['support-warning', ['background', 'layer-01'], UI],
  ['support-error', ['background', 'layer-01'], UI],
  ['text-placeholder', ['field-01'], TEXT],
  // Added for Keepia.
  ['link-secondary', ['background', 'layer-01'], TEXT],
  ['link-inverse', ['background-inverse'], TEXT],
  ['link-inverse-hover', ['background-inverse'], TEXT],
  ['text-on-color', ['button-primary-active'], TEXT],
  ['button-tertiary', ['background', 'layer-01'], TEXT],
  ['interactive', ['background', 'layer-01', 'field-01'], UI],
  ['border-interactive', ['background', 'layer-01', 'field-01'], UI],
  ['icon-interactive', ['background', 'layer-01', 'field-01'], UI],
  ['focus-inverse', ['background-inverse'], UI],
  // The logo tile. In G100 it is allowed on `background` and `layer-01` only (README, "Logo"):
  // on `layer-02` it reaches 2.32:1.
  ['background-brand', ['background', 'layer-01'], UI],
];

// The focus ring of a button: Carbon draws `focus` outside and `focus-inset` inside, so the
// ring is visible when the better of the two reaches 3:1 against the button. In White, `focus`
// on `button-primary` is 1.00:1 (both Teal 60); the inner ring carries it (pklnx/design-system#10).
export const RINGS = [['focus', 'focus-inset']];
export const RING_GROUNDS = ['button-primary', 'button-primary-hover', 'button-primary-active'];

export const THEMES = ['light', 'dark'];

// Every pair of both themes as a report row: { theme, fg, ground, ratio, min, ok }. For a ring
// `fg` is "focus|focus-inset" and the ratio is the better ring's. A pair with a translucent
// rgba() token (Carbon's `text-placeholder`) is not rated, as in pklnx/design-system: its row has
// `ratio: null, ok: null`, and scripts/contrast.test.mjs pins the list of those rows. A token
// missing from a theme is an error.
export function evaluate(tokens) {
  const rows = [];
  for (const theme of THEMES) {
    const t = tokens[theme];
    const get = (n) => {
      if (!Object.hasOwn(t, n)) throw new Error(`${theme}: no token ${n}`);
      return t[n];
    };
    const row = (fg, ground, r, min) => {
      rows.push(r == null
        ? { theme, fg, ground, ratio: null, min, ok: null }
        : { theme, fg, ground, ratio: round2(r), min, ok: r >= min });
    };
    for (const [fg, grounds, min] of PAIRS) for (const g of grounds) row(fg, g, ratio(get(fg), get(g)), min);
    for (const ring of RINGS) for (const g of RING_GROUNDS) {
      const rs = ring.map((fg) => ratio(get(fg), get(g)));
      row(ring.join('|'), g, rs.some((r) => r == null) ? null : Math.max(...rs), UI);
    }
  }
  return rows;
}

// True when the row involves a token the Keepia theme changes in that theme.
export function touchesChanged(row, changed) {
  return [...row.fg.split('|'), row.ground].some((n) => Object.hasOwn(changed[row.theme], n));
}

// The key of a row, for comparing lists: "light support-warning/background".
export const keyOf = (row) => `${row.theme} ${row.fg}/${row.ground}`;
