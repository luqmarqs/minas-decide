import { chromium } from '@playwright/test';
import fs from 'node:fs';
const B = 'http://127.0.0.1:8791',
  AXE = fs.readFileSync(process.env.AXE, 'utf8');
const br = await chromium.launch();
const c = await br.newContext({
  viewport: { width: 1440, height: 900 },
  bypassCSP: true,
  locale: 'pt-BR',
});
const p = await c.newPage();
for (const u of [
  '/',
  '/territorio/mg-3140001',
  '/atividade/652c53f7-449d-4bb3-9b51-120397afbcaa',
]) {
  await p.goto(B + u);
  await p.waitForTimeout(3500);
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => {
    const x = await axe.run(document, { runOnly: ['color-contrast', 'heading-order'] });
    return x.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        t: n.target.join(' ').slice(0, 70),
        d: n.any[0]?.data?.fgColor
          ? n.any[0].data.fgColor +
            ' on ' +
            n.any[0].data.bgColor +
            ' = ' +
            n.any[0].data.contrastRatio +
            ' ' +
            n.any[0].data.fontSize
          : n.failureSummary?.slice(0, 80),
        txt: n.html.slice(0, 80),
      })),
    );
  });
  console.log(u);
  r.forEach((x) => console.log(' ', JSON.stringify(x)));
}
// touch targets mobile
const m = await br.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'pt-BR',
});
const q = await m.newPage();
for (const u of ['/', '/participar', '/territorio/mg-3140001']) {
  await q.goto(B + u);
  await q.waitForTimeout(3000);
  const s = await q.evaluate(() =>
    [...document.querySelectorAll('a,button,input,select,[role=button],[role=radio],[role=tab]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          (r.width < 44 || r.height < 44) &&
          getComputedStyle(e).visibility !== 'hidden'
        );
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return (
          e.tagName +
          ' ' +
          (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) +
          ' ' +
          Math.round(r.width) +
          'x' +
          Math.round(r.height)
        );
      }),
  );
  console.log('TOUCH', u, s.length, s.slice(0, 15));
}
await br.close();
