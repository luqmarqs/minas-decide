// Gera public/favicon.svg (padrão) e public/brand/favicon-sun.svg a partir do SVG vetorial
// do sol (src/components/brand). O favicon provisório antigo fica em public/favicon-provisorio.svg.
// Uso: npx tsx scripts/visual/brand-favicon.ts [--preview <arquivo.html>]
import fs from 'node:fs';
import { sunSvgDocument } from '../../src/components/brand/sunGeometry';

const favicon = sunSvgDocument('#e8ba1f', '#262824');
fs.mkdirSync('public/brand', { recursive: true });
for (const out of ['public/favicon.svg', 'public/brand/favicon-sun.svg']) {
  fs.writeFileSync(out, favicon + '\n');
  console.log(out, favicon.length, 'bytes');
}

const i = process.argv.indexOf('--preview');
const previewFile = i > 0 ? process.argv[i + 1] : undefined;
if (previewFile) {
  const big = sunSvgDocument('#e8ba1f').replace('<svg', '<svg width="480"');
  const sizes = [64, 32, 16].map((s) => favicon.replace('<svg', `<svg width="${s}"`)).join('');
  fs.writeFileSync(
    previewFile,
    `<body style="margin:0;background:#067fa8"><div style="display:flex;gap:24px;align-items:end;padding:24px">${big}${sizes}</div></body>`,
  );
}
