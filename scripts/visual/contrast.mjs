// Contraste WCAG dos tokens. Uso: node scripts/visual/contrast.mjs [--brand provisorio]
// Padrão: identidade oficial "Minas Decide" (:root + escuros).
// --brand provisorio: aplica o tema provisório (rollback, data-brand='provisorio') por cima.
import fs from 'node:fs';
const css = fs.readFileSync('src/styles/tokens.css', 'utf8');
const bi = process.argv.indexOf('--brand');
const PROVISIONAL = bi > 0 && process.argv[bi + 1] === 'provisorio';
const BRAND = !PROVISIONAL; // official identity rules (action = UI only, raw art pairs)
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
/** Body of the first rule whose selector line starts with `sel` (brace-balanced). */
const block = (sel) => {
  const i = css.indexOf(sel);
  if (i < 0) throw new Error('bloco ausente: ' + sel);
  let j = css.indexOf('{', i) + 1;
  for (let depth = 1, k = j; k < css.length; k++) {
    if (css[k] === '{') depth++;
    else if (css[k] === '}' && --depth === 0) return css.slice(j, k);
  }
  throw new Error('bloco sem fim: ' + sel);
};
const base = parse(block(':root {'));
const baseDark = parse(block(":root[data-theme='dark'] {"));
let light = base;
let dark = { ...base, ...baseDark };
if (PROVISIONAL) {
  const pLight = parse(block(":root[data-brand='provisorio'] {"));
  const pDark = parse(block(":root[data-brand='provisorio'][data-theme='dark'] {"));
  light = { ...base, ...pLight };
  dark = { ...base, ...baseDark, ...pLight, ...pDark };
}
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
  ['border-strong', 'surface-alt'],
  ['border-strong', 'surface-raised'],
  ['focus', 'surface-alt'],
  ['text-secondary', 'surface-raised'],
  ['warning', 'surface'],
  ['info', 'surface'],
  ['border', 'surface'],
];
console.log(BRAND ? '# identidade oficial Minas Decide (padrão)' : '# tema provisório (rollback)');
let failures = 0;
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
    // Na variante, o azul de ação e o amarelo nunca são texto (só preenchimento/UI):
    // ação exige 3:1 (WCAG 1.4.11); o amarelo em fundo claro é só superfície (informativo).
    const surfaceOnly = BRAND && n === 'claro' && f === 'accent';
    const need =
      f === 'border'
        ? 1
        : /^(focus|border|accent)/.test(f) || (BRAND && f === 'action-primary')
          ? 3
          : 4.5;
    if (r < need && !surfaceOnly) failures++;
    console.log(
      f.padEnd(16),
      b.padEnd(15),
      F,
      Bg,
      r.toFixed(2),
      r >= need
        ? 'ok'
        : surfaceOnly
          ? 'só superfície (nunca texto/borda informativa)'
          : 'FALHA(<' + need + ')',
      BRAND && f === 'action-primary' ? '(UI: nunca como texto)' : '',
    );
  }
}
if (BRAND) {
  // Pares específicos da variante (cores cruas da arte, hero sempre oliva).
  const raw = { ...light };
  const extra = [
    ['brand-cream', 'brand-olive-deep', 4.5, 'título/texto do hero'],
    ['brand-cream', 'brand-olive', 4.5, 'texto sobre oliva'],
    ['brand-sun', 'brand-olive-deep', 3, 'sol (UI) sobre oliva'],
    ['brand-ink', 'brand-sun', 4.5, 'botão "Eu vou" amarelo'],
    ['brand-sun', 'color-surface', 3, 'amarelo sobre creme (só superfície!)'],
  ];
  console.log('== cores cruas');
  for (const [f, b, need, why] of extra) {
    const F = raw[f] ?? light['color-' + f] ?? raw[f.replace('color-', '')];
    const Bg = raw[b] ?? light[b.replace('color-', 'color-')];
    if (!F || !Bg) continue;
    const r = cr(F, Bg);
    if (r < need && !why.includes('só superfície')) failures++;
    console.log(
      f.padEnd(16),
      b.padEnd(17),
      F,
      Bg,
      r.toFixed(2),
      r >= need
        ? 'ok'
        : why.includes('só superfície')
          ? 'proibido como texto/UI'
          : 'FALHA(<' + need + ')',
      '—',
      why,
    );
  }
}
console.log('');
console.log(failures ? `${failures} par(es) abaixo da meta` : 'todos os pares na meta');
process.exitCode = failures ? 1 : 0;
