#!/usr/bin/env node
// WCAG 2.x contrast check for the SoloOps AI colour tokens. No dependencies.
// Keep these values in sync with docs/design/ui-ux-design-system.md (section "Colour tokens").
// Text pairs need 4.5:1 (AA normal text); non-text UI (borders of controls, focus rings, icons) needs 3:1.

const light = {
  bg: '#F7F8FA', surface: '#FFFFFF', surfaceMuted: '#F1F3F6',
  borderStrong: '#7A8496',
  text: '#111827', textMuted: '#4B5563', textSubtle: '#636A77', textInverse: '#FFFFFF',
  primary: '#2550C7', primaryHover: '#1D3FA3', primarySubtle: '#E8EEFC', onPrimarySubtle: '#1D3FA3',
  secondaryText: '#334155', focus: '#2550C7',
  aiFg: '#5B21B6', aiBg: '#F5F3FF', aiBorder: '#7C5CD6',
  successFg: '#166534', successBg: '#DCFCE7', successIcon: '#15803D',
  warningFg: '#9A3412', warningBg: '#FFEDD5',
  errorFg: '#991B1B', errorBg: '#FEE2E2', danger: '#B91C1C', dangerHover: '#991B1B',
  pendingFg: '#854D0E', pendingBg: '#FEF3C7', pendingIcon: '#B45309',
  infoFg: '#1E40AF', infoBg: '#DBEAFE',
  neutralFg: '#374151', neutralBg: '#F1F3F6',
  baselineFg: '#334155', baselineBg: '#E2E8F0',
  additionalFg: '#115E59', additionalBg: '#CCFBF1',
};

const dark = {
  bg: '#0F1115', surface: '#171A21', surfaceMuted: '#1F232C',
  borderStrong: '#6B7385',
  text: '#E6E8EC', textMuted: '#A7AFBD', textSubtle: '#8E97A8',
  primary: '#7EA6FF', primaryHover: '#A3C0FF', onPrimary: '#0B1220', link: '#8DB0FF',
  primarySubtle: '#1B2440', onPrimarySubtle: '#B5CBFF', focus: '#8DB0FF',
  aiFg: '#C4B5FD', aiBg: '#231A3D', aiBorder: '#8B6FE0',
  successFg: '#86EFAC', successBg: '#0F2A1A',
  warningFg: '#FDBA74', warningBg: '#33190A',
  errorFg: '#FCA5A5', errorBg: '#3A1212', danger: '#C93030', dangerHover: '#B02626', onDanger: '#FFFFFF',
  pendingFg: '#FCD34D', pendingBg: '#2E2306',
  infoFg: '#93C5FD', infoBg: '#0F1F3D',
  neutralFg: '#D1D5DB', neutralBg: '#252A33',
  baselineFg: '#CBD5E1', baselineBg: '#252A33',
  additionalFg: '#5EEAD4', additionalBg: '#0B2A27',
};

const T = 4.5; // text
const U = 3;   // non-text UI
const pairs = [
  ...[['bg', 'text'], ['surface', 'text'], ['surfaceMuted', 'text'],
      ['bg', 'textMuted'], ['surface', 'textMuted'], ['surfaceMuted', 'textMuted'],
      ['bg', 'textSubtle'], ['surface', 'textSubtle'], ['surfaceMuted', 'textSubtle']]
    .flatMap(([b, f]) => [['light', f, b, T], ['dark', f, b, T]]),
  ['light', 'textInverse', 'primary', T], ['light', 'textInverse', 'primaryHover', T],
  ['light', 'primary', 'surface', T], ['light', 'primary', 'bg', T],
  ['light', 'onPrimarySubtle', 'primarySubtle', T], ['light', 'secondaryText', 'surface', T],
  ['light', 'textInverse', 'danger', T], ['light', 'textInverse', 'dangerHover', T],
  ['dark', 'onPrimary', 'primary', T], ['dark', 'onPrimary', 'primaryHover', T],
  ['dark', 'link', 'surface', T], ['dark', 'link', 'bg', T],
  ['dark', 'onPrimarySubtle', 'primarySubtle', T], ['dark', 'onDanger', 'danger', T], ['dark', 'onDanger', 'dangerHover', T],
  // badges / tags (fg on own bg) and semantic text placed directly on the surface
  ...['ai', 'success', 'warning', 'error', 'pending', 'info', 'neutral', 'baseline', 'additional']
    .flatMap((k) => [['light', `${k}Fg`, `${k}Bg`, T], ['dark', `${k}Fg`, `${k}Bg`, T],
                     ['light', `${k}Fg`, 'surface', T], ['dark', `${k}Fg`, 'surface', T]]),
  ['light', 'text', 'aiBg', T], ['light', 'textMuted', 'aiBg', T], ['dark', 'text', 'aiBg', T], ['dark', 'textMuted', 'aiBg', T],
  // non-text UI
  ...['bg', 'surface', 'surfaceMuted'].flatMap((b) => [['light', 'borderStrong', b, U], ['dark', 'borderStrong', b, U],
                                                       ['light', 'focus', b, U], ['dark', 'focus', b, U]]),
  ['light', 'aiBorder', 'surface', U], ['dark', 'aiBorder', 'surface', U],
  ['light', 'successIcon', 'surface', U], ['light', 'pendingIcon', 'surface', U], ['light', 'danger', 'surface', U],
];

const lum = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let failures = 0;
for (const [mode, fgKey, bgKey, min] of pairs) {
  const t = mode === 'light' ? light : dark;
  const fg = t[fgKey]; const bg = t[bgKey];
  if (!fg || !bg) { console.log(`ERROR ${mode}: unknown token ${!fg ? fgKey : bgKey}`); failures++; continue; }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 ≥${min}  ${mode.padEnd(5)} ${fgKey} ${fg} on ${bgKey} ${bg}`);
}
console.log(`${pairs.length} pairs checked, ${failures} failure(s).`);
process.exit(failures ? 1 : 0);
