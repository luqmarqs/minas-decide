// Captura um elemento no Pixel 7 e lista tamanhos de fonte renderizados (px na tela) de text/p.
// Uso: node scripts/visual/element-shot.mjs <url> <seletor> <saida.png>
import { chromium, devices } from '@playwright/test';
const [url, sel, out] = process.argv.slice(2);
const b = await chromium.launch();
const c = await b.newContext({ ...devices['Pixel 7'], locale: 'pt-BR' });
const p = await c.newPage();
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(2500);
const el = p.locator(sel).first();
await el.scrollIntoViewIfNeeded();
await p.waitForTimeout(500);
await el.screenshot({ path: out });
console.log(
  await p.evaluate((s) => {
    const r = [];
    document
      .querySelectorAll(s + ' text, ' + s + ' p')
      .forEach((e) =>
        r.push(
          Math.round(
            parseFloat(getComputedStyle(e).fontSize) *
              (e.getScreenCTM ? e.getScreenCTM().a : 1) *
              10,
          ) /
            10 +
            ' ' +
            e.textContent.slice(0, 20),
        ),
      );
    return r.join('\n');
  }, sel),
);
await b.close();
