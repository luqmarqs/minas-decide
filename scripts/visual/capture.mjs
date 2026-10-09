// Reproduz capturas finais + axe + checks.
// Uso: BASE=http://127.0.0.1:8791 DEMO=http://localhost:5174 AXE=<caminho axe.min.js> node scripts/visual/capture.mjs
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8791';
const DEMO = process.env.DEMO ?? 'http://localhost:5174';
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const OUT = 'docs/screenshots/final';
fs.mkdirSync(OUT, { recursive: true });
const VP = { desktop1440: { width: 1440, height: 900 }, mobile390: { width: 390, height: 844 } };
const ACT = '652c53f7-449d-4bb3-9b51-120397afbcaa';
const log = { shots: [], axe: {}, overflow: {}, notes: [] };
const browser = await chromium.launch();

async function ctx(dev, opts = {}) {
  return browser.newContext({
    viewport: VP[dev],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    isMobile: dev.startsWith('mobile'),
    hasTouch: dev.startsWith('mobile'),
    deviceScaleFactor: 1,
    bypassCSP: true,
    ...opts,
  });
}
async function shot(page, name, dev, state, full = true) {
  const f = `${OUT}/${name}-${dev}-${state}-${date}-${commit}.png`;
  await page.screenshot({ path: f, fullPage: full });
  log.shots.push(f);
}
async function settle(page, ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}
async function ovf(page, key) {
  log.overflow[key] = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: innerWidth,
    over: document.documentElement.scrollWidth > innerWidth,
  }));
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
const paths = {
  territorio: '/territorio/mg-3140001',
  bairro: '/territorio/mg-3140001-centro',
  atividade: `/atividade/${ACT}`,
  participar: '/participar',
  obrigado: '/obrigado?territorio=mg-3140001-centro',
  'propor-grupo': '/propor-grupo',
  'criar-atividade': '/criar-atividade',
  metodologia: '/metodologia',
  404: '/rota-inexistente',
};
const states = {
  bairro: 'bairro-centro',
  territorio: 'mariana',
  atividade: 'cancelada',
  obrigado: 'sem-grupo',
  'criar-atividade': 'sem-sessao',
};

for (const dev of Object.keys(VP)) {
  const c = await ctx(dev);
  const page = await c.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  await page.goto(BASE + '/');
  await settle(page, 4000);
  await shot(page, 'home', dev, 'abstencao', false);
  await ovf(page, `home-${dev}`);
  if (dev === 'desktop1440') await axe(page, 'home');

  const cb = page.getByRole('combobox', { name: /Cidade ou bairro/ }).first();
  await page.keyboard.press('Tab');
  await cb.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await shot(page, 'home', dev, 'foco-combobox', false);
  await cb.fill('Mariana');
  await page.waitForTimeout(600);
  await shot(page, 'home', dev, 'combobox-lista', false);
  const kb = {};
  kb.options = await page.getByRole('option').count();
  await page.keyboard.press('ArrowDown');
  kb.afterDown = await cb.getAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowDown');
  kb.afterDown2 = await cb.getAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowUp');
  kb.afterUp = await cb.getAttribute('aria-activedescendant');
  kb.expanded = await cb.getAttribute('aria-expanded');
  await page.keyboard.press('Escape');
  kb.expandedAfterEsc = await cb.getAttribute('aria-expanded');
  kb.valueAfterEsc = await cb.inputValue();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await settle(page, 2500);
  kb.urlAfterEnter = page.url();
  log.notes.push({ combobox: dev, ...kb });
  await shot(page, 'home', dev, 'municipio-selecionado', false);
  await ovf(page, `home-selecionado-${dev}`);

  await page.goto(BASE + '/participar');
  await settle(page, 800);
  await page.getByRole('button', { name: 'Cadastrar' }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await shot(page, 'participar', dev, 'foco-botao', false);

  for (const [n, p] of Object.entries(paths)) {
    await page.goto(BASE + p);
    await settle(page, n === 'territorio' || n === 'bairro' ? 3500 : 1200);
    const nm = n === 'bairro' ? 'territorio' : n;
    await shot(page, nm, dev, states[n] ?? 'padrao');
    await ovf(page, `${n}-${dev}`);
    if (dev === 'desktop1440' && ['territorio', 'participar', 'atividade'].includes(n))
      await axe(page, n);
    if (n === 'participar') {
      await page.getByRole('button', { name: 'Cadastrar' }).click();
      await page.waitForTimeout(800);
      await shot(page, 'participar', dev, 'erros-validacao');
      await ovf(page, `participar-erros-${dev}`);
      if (dev === 'desktop1440') await axe(page, 'participar-erros');
    }
  }
  await page.goto(BASE + '/atividade/00000000-0000-4000-8000-000000000000');
  await settle(page, 1200);
  await shot(page, 'atividade', dev, 'nao-encontrada');
  log.notes.push({ consoleErrors: dev, list: errs.slice(0, 10) });
  await c.close();
}

for (const dev of Object.keys(VP)) {
  const c = await ctx(dev, { colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await c.newPage();
  await page.goto(BASE + '/');
  await settle(page, 4000);
  await shot(page, 'home', dev, 'escuro-reduced-motion', false);
  log.notes.push({
    reducedMotion: dev,
    ...(await page.evaluate(() => ({
      mq: matchMedia('(prefers-reduced-motion: reduce)').matches,
      anims: document.getAnimations().length,
    }))),
  });
  if (dev === 'desktop1440') {
    await axe(page, 'home-escuro');
    await page.goto(BASE + '/territorio/mg-3140001');
    await settle(page, 3000);
    await shot(page, 'territorio', dev, 'escuro-mariana');
    await axe(page, 'territorio-escuro');
  }
  await c.close();
}

for (const dev of Object.keys(VP)) {
  const c = await ctx(dev);
  const page = await c.newPage();
  await page.goto(DEMO + '/');
  await settle(page, 4000);
  await shot(page, 'home', dev, 'demo', false);
  log.notes.push({
    demo: dev,
    badge: await page
      .getByText(/demo/i)
      .first()
      .textContent()
      .catch(() => null),
  });
  await c.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/_resultados.json`, JSON.stringify(log, null, 1));
console.log(
  JSON.stringify({ shots: log.shots.length, overflow: log.overflow, notes: log.notes }, null, 1),
);
