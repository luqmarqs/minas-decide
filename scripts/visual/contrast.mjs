import fs from 'node:fs';
const css = fs.readFileSync('src/styles/tokens.css', 'utf8');
const idx = css.indexOf('@media (prefers-color-scheme: dark)');
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const light = parse(css.slice(0, idx));
const darkBlock = css.slice(idx);
const dark = { ...light, ...parse(darkBlock) };
const lum = (h) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const cr = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pairs = [
  ['text-primary', 'surface'],
  ['text-primary', 'surface-alt'],
  ['text-primary', 'surface-raised'],
  ['text-secondary', 'surface'],
  ['text-secondary', 'surface-alt'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-alt'],
  ['text-muted', 'surface-raised'],
  ['text-on-action', 'action-primary'],
  ['text-on-action', 'action-hover'],
  ['action-primary', 'surface'],
  ['action-primary', 'action-soft'],
  ['success', 'success-soft'],
  ['success', 'surface'],
  ['warning', 'warning-soft'],
  ['error', 'error-soft'],
  ['error', 'surface'],
  ['info', 'info-soft'],
  ['demo', 'demo-soft'],
  ['demo', 'surface'],
  ['focus', 'surface'],
  ['focus', 'surface-raised'],
  ['accent', 'surface'],
  ['border-strong', 'surface'],
  ['border', 'surface'],
];
for (const [n, t] of [
  ['claro', light],
  ['escuro', dark],
]) {
  console.log('==', n);
  for (const [f, b] of pairs) {
    const F = t['color-' + f],
      Bg = t['color-' + b];
    if (!F || !Bg) continue;
    const r = cr(F, Bg);
    const need = /^(focus|border|accent)/.test(f) ? 3 : 4.5;
    console.log(
      f.padEnd(16),
      b.padEnd(15),
      F,
      Bg,
      r.toFixed(2),
      r >= need ? 'ok' : 'FALHA(<' + need + ')',
    );
  }
}
