// FE-10: mede a área visível do mapa no mobile com município selecionado + capturas + axe.
// Uso: BASE=http://127.0.0.1:8795 TAG=antes AXE=<axe.min.js> node scripts/visual/mobile-map.mjs
// "Mapa visível" = linhas da viewport (passo de 8 px) em que ≥ 50 % dos pontos amostrados
// atingem o canvas do MapLibre via elementFromPoint (descontando header, barra de camadas,
// legenda, sheet e popovers sobrepostos). Também reporta a fração de área.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8795';
const TAG = process.env.TAG ?? 'depois';
const OUT = process.env.OUT ?? 'docs/screenshots/mobile';
const AXE = process.env.AXE ? fs.readFileSync(process.env.AXE, 'utf8') : null;
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = {
  pixel7: { ...devices['Pixel 7'] },
  iphone13: { ...devices['iPhone 13'], defaultBrowserType: undefined },
};

async function measure(page) {
  return page.evaluate(() => {
    const step = 8;
    const vw = innerWidth;
    const vh = innerHeight;
    let rows = 0;
    let hits = 0;
    let total = 0;
    for (let y = step / 2; y < vh; y += step) {
      let rowHits = 0;
      let rowTotal = 0;
      for (let x = step / 2; x < vw; x += step) {
        const el = document.elementFromPoint(x, y);
        const onMap =
          !!el &&
          (el.classList.contains('maplibregl-canvas') || !!el.closest('.maplibregl-marker'));
        rowTotal++;
        if (onMap) rowHits++;
      }
      total += rowTotal;
      hits += rowHits;
      if (rowHits / rowTotal >= 0.5) rows++;
    }
    const rowsTotal = Math.ceil(vh / step);
    const box = document.querySelector('#mapa')?.getBoundingClientRect();
    return {
      viewport: `${vw}x${vh}`,
      visibleHeightPx: rows * step,
      visibleHeightPct: Math.round((rows / rowsTotal) * 1000) / 10,
      visibleAreaPct: Math.round((hits / total) * 1000) / 10,
      mapSection: box ? { top: Math.round(box.top), height: Math.round(box.height) } : null,
      overflowX: document.documentElement.scrollWidth > vw,
    };
  });
}

async function runAxe(page) {
  if (!AXE) return null;
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const r = await axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      count: v.nodes.length,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 4),
    }));
  });
}

const results = {};
const browser = await chromium.launch();
for (const [dev, desc] of Object.entries(DEVICES)) {
  const context = await browser.newContext({
    ...desc,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // axe is injected as an inline script: the Worker's CSP would block it.
    bypassCSP: true,
  });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${dev}-home-${TAG}.png` });
  const r = { home: await measure(page) };
  const input = page.getByRole('combobox', { name: /Cidade ou bairro/ });
  await input.fill('Mariana');
  await page
    .getByRole('option', { name: /^Mariana\/MG/ })
    .first()
    .click();
  await page.waitForTimeout(4500);
  r.selected = await measure(page);
  await page.screenshot({ path: `${OUT}/${dev}-mapa-mariana-${TAG}.png` });
  r.axeSelected = await runAxe(page);
  // Legend chip (new UI) expands.
  const chip = page.locator('[data-testid="legend-chip"]');
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${dev}-legenda-${TAG}.png` });
    await page.keyboard.press('Escape');
  }
  // Layer popover (new UI).
  const layerBtn = page.locator('[data-testid="layer-bar-trigger"]');
  if (await layerBtn.count()) {
    await layerBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${dev}-camadas-${TAG}.png` });
    await page.keyboard.press('Escape');
  }
  // Infographic carousel.
  const strip = page.locator('[data-testid="why-minas-carousel"]');
  if (await strip.count()) {
    await strip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${dev}-infografico-${TAG}.png` });
  }
  results[dev] = r;
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
fs.writeFileSync(`${OUT}/_medicao-${TAG}.json`, JSON.stringify(results, null, 1));
