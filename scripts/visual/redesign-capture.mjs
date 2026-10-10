/**
 * Redesign editorial — captures de baseline/depois (mesmo roteiro para as duas rodadas).
 *
 *   node scripts/visual/redesign-capture.mjs <baseUrl> <outDir>
 *
 * Para cada viewport (390×844, 768×1024, 1024×768, 1440×900) e tema (claro/escuro):
 *   home-<vp>-<tema>.png            página inteira
 *   hero-<vp>-<tema>.png            SÓ a região do hero (regressão visual do hero congelado)
 *   story-<vp>-<tema>.png           seção narrativa
 *   infografico-<vp>-<tema>.png     seção "por que Minas decide"
 *   mapa-bh-<vp>-<tema>.png         mapa com Belo Horizonte selecionada (viewport)
 *   agenda-participar-<vp>-<tema>.png  agenda + cadastro
 * O tema escuro é emulado por `prefers-color-scheme` (sem tocar no armazenamento).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:8788', out = 'docs/screenshots/redesign-editorial/antes'] =
  process.argv.slice(2);
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  m390: { width: 390, height: 844, mobile: true },
  t768: { width: 768, height: 1024, mobile: true },
  l1024: { width: 1024, height: 768, mobile: false },
  d1440: { width: 1440, height: 900, mobile: false },
};
const THEMES = ['light', 'dark'];

async function settle(page) {
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(1200);
}

async function shotSection(page, selector, file) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return false;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await el.screenshot({ path: file, animations: 'disabled' });
  return true;
}

const browser = await chromium.launch();
for (const [vp, { width, height, mobile }] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
      colorScheme: theme,
      reducedMotion: 'reduce',
      locale: 'pt-BR',
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/`);
    await settle(page);
    const tag = `${vp}-${theme}`;
    await shotSection(page, 'section.brand-hero', `${out}/hero-${tag}.png`);
    await page.screenshot({
      path: `${out}/home-${tag}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await shotSection(page, '[data-testid="story-intro"]', `${out}/story-${tag}.png`);
    await shotSection(page, '[data-testid="why-minas"]', `${out}/infografico-${tag}.png`);
    await shotSection(page, '#agenda', `${out}/agenda-${tag}.png`);
    await shotSection(page, '#participar', `${out}/participar-${tag}.png`);

    // Mapa com BH selecionada (estado de URL já suportado pela home).
    await page.goto(`${base}/?t=mg-3106200`);
    await settle(page);
    await page.waitForTimeout(2500);
    const map = page.locator('#mapa').first();
    if ((await map.count()) > 0) {
      await map.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({
      path: `${out}/mapa-bh-${tag}.png`,
      fullPage: false,
      animations: 'disabled',
    });
    await ctx.close();
    console.log('ok', tag);
  }
}
await browser.close();
