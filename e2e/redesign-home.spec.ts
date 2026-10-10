/**
 * Redesign editorial (2026-10-09) — home depois do hero: pranchas numeradas 01→04 em ordem,
 * convites "Quero participar" sem redundância (D6), faixa de CTA removida (D7), agenda em linhas
 * editoriais (D12), cadastro como faixa escura de fechamento e sem overflow horizontal.
 * O hero é coberto por e2e/hero-freeze.spec.ts. Strings de expressão em `evaluate`: os e2e são
 * typechecados sem a lib DOM.
 */
import { expect, test } from '@playwright/test';

test('pranchas 01→04 aparecem em ordem depois do hero e antes do cadastro', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // PlateHeading: "<NN>" + kicker com "Seção N:" (sr-only). Ordem do documento.
  const order = await page.evaluate<number[]>(`(() => {
    const out = [];
    for (const el of document.querySelectorAll('main p.ed-kicker')) {
      const m = /Seção (\\d+):/.exec(el.textContent || '');
      if (m) out.push(Number(m[1]));
    }
    return out;
  })()`);
  expect(order.filter((n) => n >= 1 && n <= 4)).toEqual([1, 2, 3, 4]);
  // Prancha 03 abre o mapa (fora do MapShell) e prancha 04 é a agenda; o cadastro fecha.
  const seq = await page.evaluate<boolean>(`(() => {
    const hero = document.querySelector('section.brand-hero');
    const map = document.getElementById('mapa-title');
    const mapa = document.getElementById('mapa');
    const agenda = document.getElementById('agenda-title');
    const join = document.getElementById('participar');
    const f = (a, b) => !!(a && b) && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return f(hero, map) && f(map, mapa) && f(mapa, agenda) && f(agenda, join) && !mapa.contains(map);
  })()`);
  expect(seq).toBe(true);
  await expect(page.getByText(/corpo a corpo/)).toHaveCount(0);
});

test('convites "Quero participar" fora do cabeçalho: no máximo 4', async ({ page }) => {
  await page.goto('/');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
  const links = await main.getByRole('link', { name: /Quero participar/i }).count();
  const buttons = await main.getByRole('button', { name: /Quero participar/i }).count();
  test.info().annotations.push({
    type: 'convites',
    description: `links=${links} botões=${buttons} (hero + narrativa; o cadastro final é o formulário)`,
  });
  expect(links + buttons).toBeLessThanOrEqual(4);
  // A agenda propõe atividade por link de texto, não por botão grande.
  const agenda = page.locator('#agenda');
  await expect(agenda.getByRole('link', { name: /Quero participar/i })).toHaveCount(0);
  await expect(agenda.getByRole('link', { name: 'Proponha uma atividade' })).toHaveAttribute(
    'href',
    '/criar-atividade',
  );
});

test('agenda em linhas editoriais (ou estado vazio/erro honesto)', async ({ page }) => {
  await page.goto('/#agenda');
  const agenda = page.locator('#agenda');
  await expect(agenda.getByRole('heading', { name: 'Agenda da campanha' })).toBeVisible();
  const rows = agenda.getByTestId('activity-row');
  const empty = agenda.getByText(/Nenhuma atividade publicada|Agenda indisponível/);
  await expect(rows.first().or(empty.first())).toBeVisible({ timeout: 20_000 });
  if ((await rows.count()) > 0) {
    // Sem cartão: a linha não tem borda nem sombra; separador é o filete do item.
    const style = await page.evaluate<string>(
      "(() => { const s = getComputedStyle(document.querySelector('#agenda [data-testid=activity-row]')); return s.borderTopWidth + '|' + s.boxShadow; })()",
    );
    expect(style).toBe('0px|none');
    await expect(agenda.locator('[data-testid="agenda-rows"] hr.ed-rule').first()).toBeAttached();
  }
});

test('#participar é a faixa escura de fechamento com o formulário real', async ({ page }) => {
  await page.goto('/#participar');
  const band = page.getByTestId('home-participar');
  await expect(band).toHaveClass(/ed-band-ink/);
  const bg = await page.evaluate<string>(
    "getComputedStyle(document.querySelector('[data-testid=home-participar]')).backgroundColor",
  );
  // --brand-olive-deep #1e1f1c
  expect(bg).toBe('rgb(30, 31, 28)');
  await expect(band.getByRole('heading', { name: 'Entre para a campanha em Minas' })).toBeVisible();
  await expect(band.getByLabel(/^Nome/)).toBeVisible({ timeout: 20_000 });
});

for (const width of [390, 320]) {
  test(`sem overflow horizontal em ${width}px (claro e escuro)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/#participar');
      await expect(page.getByTestId('home-participar')).toBeVisible();
      await page.locator('#agenda').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      // Elementos das seções da home (main) que passam da largura da janela. O cabeçalho fica de
      // fora: em 320px ele já transborda 14px antes do redesign (src/components/layouts, fora do
      // escopo desta rodada; registrado no relatório).
      const overflow = await page.evaluate<string[]>(`(() => {
        const W = document.documentElement.clientWidth;
        const out = [];
        for (const el of document.querySelectorAll('main *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > W + 1) out.push(el.tagName + '.' + String(el.className).slice(0, 60));
        }
        return out;
      })()`);
      expect(overflow, `${width}px ${colorScheme}`).toEqual([]);
    }
  });
}
