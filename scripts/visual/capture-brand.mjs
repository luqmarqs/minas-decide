// FE-4/FE-5 — capturas + axe + checagens da identidade "Minas Decide".
// QS = query extra (FE-4 usava "brand=1"; FE-5: vazio, identidade oficial = padrão).
// Uso: BASE=http://127.0.0.1:8792 AXE=<caminho axe.min.js> node scripts/visual/capture-brand.mjs
// Saída: docs/screenshots/brand/*.png e docs/screenshots/brand/fe4-log.json
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8792';
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const commit = execSync('git rev-parse --short=7 HEAD').toString().trim();
const DATE = '20261009';
const OUT = process.env.OUT ?? 'docs/screenshots/brand/final';
const QS = process.env.QS ?? '';
const withQs = (path) => (QS ? path + (path.includes('?') ? '&' : '?') + QS : path);
fs.mkdirSync(OUT, { recursive: true });
const VP = { desktop1440: { width: 1440, height: 900 }, mobile390: { width: 390, height: 844 } };
const SCHEMES = { claro: 'light', escuro: 'dark' };
const DEMO_ACT = '00000000-0000-4000-8000-000000000001';
const PAGES = {
  home: '/',
  territorio: '/territorio/mg-3140001',
  participar: '/participar',
  atividade: `/atividade/${DEMO_ACT}`,
};
const log = { commit, shots: [], axe: {}, overflow: {}, fonts: {}, titleContrast: {}, notes: [] };
const browser = await chromium.launch();

const ctx = (dev, scheme, extra = {}) =>
  browser.newContext({
    viewport: VP[dev],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    isMobile: dev.startsWith('mobile'),
    hasTouch: dev.startsWith('mobile'),
    deviceScaleFactor: 1,
    colorScheme: scheme,
    bypassCSP: true,
    ...extra,
  });
const file = (name, dev, state) => `${OUT}/${name}-${dev}-${state}-${DATE}-${commit}.png`;
async function settle(page, ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
async function axe(page, key) {
  await page.addScriptTag({ content: AXE });
  log.axe[key] = await page.evaluate(async () => {
    const x = await axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    });
    return x.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 6),
    }));
  });
}
async function overflow(page, key) {
  log.overflow[key] = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
}

/** Worst-case contrast of the hero title: hide the glyphs, read the pixels behind them. */
async function titleContrast(page, key) {
  const box = await page.locator('#home-title').boundingBox();
  if (!box) return;
  await page.addStyleTag({
    content: '#home-title, #home-title * { color: transparent !important; }',
  });
  await page.waitForTimeout(100);
  const buf = await page.screenshot({ clip: box });
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('style')].pop();
    s?.remove();
  });
  log.titleContrast[key] = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const L = (r, gg, bb) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
    let max = 0;
    let sum = 0;
    const lums = [];
    for (let i = 0; i < d.length; i += 4) {
      const l = L(d[i], d[i + 1], d[i + 2]);
      lums.push(l);
      sum += l;
      if (l > max) max = l;
    }
    lums.sort((a, b) => a - b);
    const p99 = lums[Math.floor(lums.length * 0.99)];
    const cream = L(0xeb, 0xd6, 0xca);
    const cr = (bg) => (cream + 0.05) / (bg + 0.05);
    return {
      worstPixel: +cr(max).toFixed(2),
      p99: +cr(p99).toFixed(2),
      mean: +cr(sum / lums.length).toFixed(2),
    };
  }, buf.toString('base64'));
}

for (const dev of Object.keys(VP)) {
  for (const [state, scheme] of Object.entries(SCHEMES)) {
    const c = await ctx(dev, scheme);
    const page = await c.newPage();
    const fontReqs = [];
    page.on('request', (r) => r.url().includes('/fonts/') && fontReqs.push(r.url()));
    for (const [name, path] of Object.entries(PAGES)) {
      await page.goto(BASE + withQs(path));
      await settle(page, name === 'home' || name === 'territorio' ? 4500 : 2000);
      const key = `${name}-${dev}-${state}`;
      const brandOn = await page.evaluate(() => document.documentElement.dataset.brand);
      if (brandOn !== 'minas-decide') log.notes.push(`${key}: variante NÃO ativa`);
      const f = file(name, dev, state);
      await page.screenshot({ path: f, fullPage: true });
      log.shots.push(f);
      if (name === 'home') {
        await page.screenshot({ path: file('home-dobra', dev, state), fullPage: false });
        log.shots.push(file('home-dobra', dev, state));
        await titleContrast(page, key);
      }
      await axe(page, key);
      await overflow(page, key);
    }
    log.fonts[`${dev}-${state}`] = {
      anton: await page.evaluate(() => document.fonts.check('20px Anton')),
      bungee: await page.evaluate(() => document.fonts.check('20px "Bungee Outline"')),
      requests: [...new Set(fontReqs.map((u) => new URL(u).pathname))],
    };
    // Header/lockup zoom (2x) on the last page of this context.
    if (dev === 'desktop1440' || state === 'claro') {
      const z = await ctx(dev, scheme, { deviceScaleFactor: 3 });
      const zp = await z.newPage();
      await zp.goto(BASE + withQs('/'));
      await settle(zp, 1200);
      const hb = await zp.locator('body > div header').first().boundingBox();
      const lw = await zp.getByRole('link', { name: /página inicial/ }).boundingBox();
      const clip = {
        x: 0,
        y: 0,
        width: Math.min(hb.width, (lw?.x ?? 0) + (lw?.width ?? 300) + 24),
        height: hb.height,
      };
      const zf = file('header-lockup-zoom', dev, state);
      await zp.screenshot({ path: zf, clip });
      log.shots.push(zf);
      await z.close();
    }
    await c.close();
  }
}

// Antes/depois da home (desktop e mobile, claro): tema provisório (rollback) × oficial.
for (const dev of Object.keys(VP)) {
  for (const [label, q] of [
    ['antes-provisorio', 'brand=0'],
    ['depois-oficial', QS],
  ]) {
    const c = await ctx(dev, 'light');
    const page = await c.newPage();
    const fontReqs = [];
    page.on('request', (r) => r.url().includes('/fonts/') && fontReqs.push(r.url()));
    await page.goto(q ? `${BASE}/?${q}` : `${BASE}/`);
    await settle(page, 4000);
    const f = `${OUT}/home-${label}-${dev}-claro-${DATE}-${commit}.png`;
    await page.screenshot({ path: f, fullPage: false });
    log.shots.push(f);
    if (label.startsWith('antes')) {
      log.fonts[`provisorio-${dev}`] = { requests: fontReqs };
      await axe(page, `home-provisorio-${dev}-claro`);
    }
    await c.close();
  }
}

// Reduced motion: hero has no motion; check computed transitions/animations are absent.
{
  const c = await ctx('mobile390', 'light', { reducedMotion: 'reduce' });
  const page = await c.newPage();
  await page.goto(BASE + withQs('/'));
  await settle(page, 1500);
  log.reducedMotion = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.brand-hero, .brand-hero *')];
    return els.filter((e) => getComputedStyle(e).animationName !== 'none').length;
  });
  await c.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/fe4-log.json`, JSON.stringify(log, null, 2));
const axeSummary = Object.fromEntries(
  Object.entries(log.axe).map(([k, v]) => [k, v.map((x) => `${x.id}(${x.impact}):${x.count}`)]),
);
console.log(
  JSON.stringify(
    {
      axe: axeSummary,
      overflow: log.overflow,
      fonts: log.fonts,
      titleContrast: log.titleContrast,
      reducedMotion: log.reducedMotion,
      notes: log.notes,
    },
    null,
    1,
  ),
);
