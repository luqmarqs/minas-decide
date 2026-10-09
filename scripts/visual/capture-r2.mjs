// Capturas finais da rodada 2 (FE-3) + axe (desktop e mobile) + CLS do território mobile.
// Uso: BASE=http://127.0.0.1:8796 AXE=<caminho axe.min.js> node scripts/visual/capture-r2.mjs
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8796';
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const OUT = process.env.OUT ?? 'docs/screenshots/final-r2';
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
fs.mkdirSync(OUT, { recursive: true });
const VP = { desktop1440: { width: 1440, height: 900 }, mobile390: { width: 390, height: 844 } };
const log = { commit, date, shots: [], axe: {}, cls: {}, targets: {}, notes: [] };
const browser = await chromium.launch();

const ctx = (dev, extra = {}) =>
  browser.newContext({
    viewport: VP[dev],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    isMobile: dev.startsWith('mobile'),
    hasTouch: dev.startsWith('mobile'),
    deviceScaleFactor: 1,
    bypassCSP: true, // only to inject axe-core; the app itself runs under its CSP otherwise
    ...extra,
  });
const shot = async (page, tela, dev, estado, fullPage = false) => {
  const f = `${OUT}/${tela}-${dev}-${estado}-${date}-${commit}.png`;
  await page.screenshot({ path: f, fullPage });
  log.shots.push(f);
};
const settle = async (page, ms = 2500) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};
async function axe(page, key) {
  await page.addScriptTag({ content: AXE });
  log.axe[key] = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      count: v.nodes.length,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
    }));
  });
}
async function smallTargets(page, key) {
  log.targets[key] = await page.evaluate(() =>
    [...document.querySelectorAll('a,button,input,[role=button],[role=tab],[role=combobox]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const style = getComputedStyle(e);
        return (
          r.width > 0 &&
          r.height > 0 &&
          style.visibility !== 'hidden' &&
          (r.width < 24 || r.height < 24)
        );
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return `${e.tagName} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
      }),
  );
}

// An activity id for /atividade (published, if any).
let activityPath = '/atividade/00000000-0000-4000-8000-000000000000';
try {
  const r = await fetch(`${BASE}/api/v1/activities?limit=1`);
  const id = (await r.json())?.data?.items?.[0]?.id;
  if (id) activityPath = `/atividade/${id}`;
} catch {
  // keep the not-found page
}
log.notes.push({ activityPath });

const AXE_PAGES = {
  home: '/',
  territorio: '/territorio/mg-3140001',
  participar: '/participar',
  atividade: activityPath,
  obrigado: '/obrigado?territorio=mg-3140001-centro',
  'propor-grupo': '/propor-grupo',
  'criar-atividade': '/criar-atividade',
};

for (const dev of Object.keys(VP)) {
  const c = await ctx(dev);
  const page = await c.newPage();
  for (const [name, path] of Object.entries(AXE_PAGES)) {
    await page.goto(BASE + path);
    await settle(page, name === 'home' || name === 'territorio' ? 6000 : 2000);
    await axe(page, `${name}-${dev}`);
    if (name === 'home' || name === 'participar') await smallTargets(page, `${name}-${dev}`);
  }
  // Home (light) + first state
  await page.goto(BASE + '/');
  await settle(page, 7000);
  await shot(page, 'home', dev, 'claro');
  await c.close();
}

// Dark theme home (desktop + mobile) — dark basemap + legend swatch outline.
for (const dev of Object.keys(VP)) {
  const c = await ctx(dev, { colorScheme: 'dark' });
  const page = await c.newPage();
  await page.goto(BASE + '/?t=mg-3140001');
  await settle(page, 8000);
  await shot(page, 'home', dev, 'escuro');
  if (dev === 'desktop1440') await axe(page, 'home-escuro-desktop1440');
  await c.close();
}

// DEMO mode (manifest 404 → synthetic snapshot): attribution must stay inside the viewport.
{
  const c = await ctx('desktop1440');
  const page = await c.newPage();
  await page.route('**/data/manifest.json', (r) => r.fulfill({ status: 404, body: 'nope' }));
  await page.goto(BASE + '/');
  await settle(page, 7000);
  await shot(page, 'home', 'desktop1440', 'demo');
  log.notes.push({
    demoAttribution: await page.evaluate(() => {
      const ps = [...document.querySelectorAll('p')].filter(
        (p) => /Malha municipal: IBGE/.test(p.textContent ?? '') && !p.closest('footer'),
      );
      const r = ps[0]?.getBoundingClientRect();
      return r
        ? { bottom: Math.round(r.bottom), viewport: innerHeight, inside: r.bottom <= innerHeight }
        : null;
    }),
  });
  await c.close();
}

// Bottom sheet half-open (mobile): select via the search like a person would.
{
  const c = await ctx('mobile390');
  const page = await c.newPage();
  await page.goto(BASE + '/');
  await settle(page, 4000);
  const cb = page.getByRole('combobox', { name: /Cidade ou bairro/ }).first();
  await cb.fill('Mariana');
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await settle(page, 6000);
  await shot(page, 'home', 'mobile390', 'bottom-sheet-meio');
  log.notes.push({
    sheet: await page.evaluate(() => {
      const sheet = document.querySelector('[data-vaul-drawer]');
      const map = document.querySelector('section[aria-label="Mapa de Minas Gerais"]');
      const s = sheet?.getBoundingClientRect();
      const m = map?.getBoundingClientRect();
      return {
        sheetTop: s ? Math.round(s.top) : null,
        mapTop: m ? Math.round(m.top) : null,
        visibleMapPx: s && m ? Math.round(s.top - Math.max(m.top, 64)) : null,
      };
    }),
  });
  await axe(page, 'home-sheet-mobile390');
  await c.close();
}

// Territory mobile: CLS measured with a buffered layout-shift observer.
{
  const c = await ctx('mobile390');
  const page = await c.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__cls += e.value;
          window.__shifts.push([
            Math.round(e.startTime),
            Number(e.value.toFixed(4)),
            (e.sources ?? []).map((s) => s.node?.nodeName ?? '?').join(','),
          ]);
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const cdp = await c.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(BASE + '/territorio/mg-3140001');
  await settle(page, 9000);
  log.cls['territorio-mobile390-cpu4x'] = await page.evaluate(() => ({
    cls: Number(window.__cls.toFixed(4)),
    shifts: window.__shifts.slice(0, 8),
  }));
  await shot(page, 'territorio', 'mobile390', 'sem-cls');
  await c.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/_resultados-r2.json`, JSON.stringify(log, null, 1));
const summary = Object.fromEntries(
  Object.entries(log.axe).map(([k, v]) => [
    k,
    v.map((x) => `${x.impact}:${x.id}(${x.count})`).join(' ') || '0',
  ]),
);
console.log(
  JSON.stringify(
    { shots: log.shots.length, axe: summary, cls: log.cls, targets: log.targets, notes: log.notes },
    null,
    1,
  ),
);
