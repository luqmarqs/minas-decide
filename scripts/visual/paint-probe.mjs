// Mede FCP/LCP observados e o início dos downloads pesados (CPU 4× via CDP).
// Uso: BASE=http://127.0.0.1:8796 node scripts/visual/paint-probe.mjs [/rota]
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://127.0.0.1:8796';
const route = process.argv[2] ?? '/';
const br = await chromium.launch();
const ctx = await br.newContext({
  viewport: { width: 412, height: 823 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1.75,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU ?? 4) });
await page.addInitScript(() => {
  window.__lcp = [];
  new PerformanceObserver((l) =>
    l
      .getEntries()
      .forEach((e) =>
        window.__lcp.push([
          Math.round(e.startTime),
          e.element?.tagName,
          (e.element?.textContent ?? '').slice(0, 30),
        ]),
      ),
  ).observe({ type: 'largest-contentful-paint', buffered: true });
});
const t0 = Date.now();
const reqs = [];
page.on('request', (r) => {
  const u = r.url().replace(BASE, '');
  if (/assets|data|tiles/.test(u)) reqs.push([Date.now() - t0, u.slice(0, 50)]);
});
await page.goto(BASE + route, { waitUntil: 'load' });
await page.waitForTimeout(6000);
const r = await page.evaluate(() => ({
  paint: performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]),
  lcp: window.__lcp,
  cls: 0,
}));
console.log(JSON.stringify(r));
console.log(
  reqs
    .slice(0, 25)
    .map((x) => x.join(' '))
    .join('\n'),
);
await br.close();
