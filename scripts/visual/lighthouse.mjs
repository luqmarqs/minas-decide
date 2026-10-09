// Lighthouse mobile (simulado, CPU 4×) contra o Worker local, usando o Chromium do Playwright.
// Uso: BASE=http://127.0.0.1:8796 OUT=docs/screenshots/final-r2 TAG=antes node scripts/visual/lighthouse.mjs [/ /territorio/mg-3140001]
// Requer rede para `npx --yes lighthouse@13.5.0`. Imprime um resumo e grava lighthouse-<nome>-<TAG>.json.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8796';
const OUT = process.env.OUT ?? 'docs/screenshots/final-r2';
const TAG = process.env.TAG ?? 'depois';
const RUNS = Number(process.env.RUNS ?? 1);
const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/', '/territorio/mg-3140001'];
fs.mkdirSync(OUT, { recursive: true });
const chrome = chromium.executablePath();
const name = (r) => (r === '/' ? 'home' : r.split('/').filter(Boolean)[0]);
const summary = [];
for (const r of routes) {
  for (let i = 0; i < RUNS; i++) {
    const file = path.join(OUT, `lighthouse-${name(r)}-${TAG}${RUNS > 1 ? `-${i + 1}` : ''}.json`);
    const run = () =>
      execFileSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        [
          '--yes',
          'lighthouse@13.5.0',
          BASE + r,
          '--quiet',
          '--output=json',
          `--output-path=${file}`,
          '--only-categories=performance,accessibility,best-practices',
          '--form-factor=mobile',
          '--throttling-method=simulate',
          '"--chrome-flags=--headless=new --no-sandbox"',
        ],
        {
          stdio: 'inherit',
          env: { ...process.env, CHROME_PATH: chrome },
          shell: process.platform === 'win32',
        },
      );
    // NO_NAVSTART ocasional do Lighthouse: até 4 tentativas.
    for (let attempt = 1; ; attempt++) {
      try {
        run();
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
      }
    }
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const a = j.audits;
    summary.push({
      route: r,
      run: i + 1,
      perf: Math.round(j.categories.performance.score * 100),
      a11y: Math.round(j.categories.accessibility.score * 100),
      bp: Math.round(j.categories['best-practices'].score * 100),
      fcp: a['first-contentful-paint'].displayValue,
      lcp: a['largest-contentful-paint'].displayValue,
      tbt: a['total-blocking-time'].displayValue,
      cls: a['cumulative-layout-shift'].displayValue,
      si: a['speed-index'].displayValue,
      bootup: (a['bootup-time'].details?.items ?? [])
        .slice(0, 4)
        .map((it) => `${String(it.url).replace(BASE, '')}:${Math.round(it.scripting)}ms`),
    });
  }
}
console.log(JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(OUT, `_lighthouse-${TAG}.json`), JSON.stringify(summary, null, 1));
