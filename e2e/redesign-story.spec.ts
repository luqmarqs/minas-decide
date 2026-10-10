/**
 * Redesign editorial — narrativa de 5 momentos (direção "A — Cartaz desdobrado").
 *
 * - Desktop (≥ 1024 px, movimento permitido): um mapa fixo por ato muda de estado conforme o
 *   momento ativo (`data-story-state` na seção e no painel).
 * - Celular: no momento 2, "resumo" (parede) e "município a município" (mosaico) lado a lado.
 * - Movimento reduzido: nada de painel fixo; cada momento com seu mapa estático (5 SVGs).
 * Só leitura (nenhum clique em ações que gravam).
 */
import { expect, test, type Page } from '@playwright/test';

const story = (page: Page) => page.getByTestId('story-intro');

/** The section is re-mounted once its data starts (placeholder → data view): retry the scroll. */
async function reachStory(page: Page) {
  await expect(async () => {
    await story(page).evaluate(
      (el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }),
      null,
      {
        timeout: 2_000,
      },
    );
  }).toPass({ timeout: 20_000 });
}

async function centerStep(page: Page, n: number) {
  await story(page)
    .locator(`li[data-step="${n}"]`)
    .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

test.describe('narrativa — desktop com movimento', () => {
  test.skip(({ isMobile }) => isMobile, 'composição de desktop');

  test('o mapa fixo muda de estado ao rolar pelos momentos', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const section = story(page);
    await reachStory(page);
    await expect(section).toHaveAttribute('data-story-mode', 'sticky');
    const panels = page.getByTestId('story-sticky');
    await expect(panels).toHaveCount(2);
    // Mesh loaded near the viewport: the panel draws real SVG maps.
    await expect(panels.first().getByTestId('story-map').first()).toBeAttached({
      timeout: 30_000,
    });
    // Nenhum mapa dentro da lista no modo fixo (o painel desenha; os passos descrevem).
    await expect(section.locator('ol [data-testid="story-map"]')).toHaveCount(0);

    for (const n of [1, 2, 4, 5]) {
      await centerStep(page, n);
      await expect(section).toHaveAttribute('data-story-state', String(n), { timeout: 5_000 });
    }
    // Volta ao momento 2: o mosaico é a camada ativa do primeiro painel.
    await centerStep(page, 2);
    await expect(panels.first()).toHaveAttribute('data-story-state', '2');
    const active = panels.first().locator('[data-layer="2"]');
    await expect(active).toHaveAttribute('data-active', 'true');
    await expect(active).toHaveCSS('opacity', '1');
    await expect(panels.first().locator('[data-layer="1"]')).toHaveCSS('opacity', '0');
    // O painel fica preso (abaixo do cabeçalho, dentro da janela) enquanto o ato rola.
    const rect = () =>
      panels
        .first()
        .locator('.ed-sticky')
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
    await centerStep(page, 1);
    const before = await rect();
    await page.mouse.wheel(0, 150);
    await expect.poll(async () => (await rect()).top).toBeCloseTo(before.top, 0);
    expect(before.top).toBeGreaterThanOrEqual(56);
    expect(before.bottom).toBeLessThanOrEqual(900);

    // Momento 3: composição de barras a toda a largura, sem mapa.
    await centerStep(page, 3);
    await expect(section).toHaveAttribute('data-story-state', '3');
    await expect(page.getByTestId('story-absence')).toBeVisible();
    const overflow = await page.evaluate(
      'document.documentElement.scrollWidth > document.documentElement.clientWidth',
    );
    expect(overflow).toBe(false);
  });

  test('laptop 1024×768: mapa fixo cabe na janela abaixo do cabeçalho', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await reachStory(page);
    await expect(story(page)).toHaveAttribute('data-story-mode', 'sticky');
    const sticky = page.getByTestId('story-sticky').first();
    await expect(sticky.getByTestId('story-map').first()).toBeAttached({ timeout: 30_000 });
    await centerStep(page, 1);
    await expect(sticky.locator('.ed-sticky')).toBeVisible();
    const box = await sticky.locator('.ed-sticky').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  });
});

test.describe('narrativa — celular', () => {
  test.skip(({ isMobile }) => !isMobile, 'composição de celular');

  test('momento 2 mostra parede e mosaico lado a lado', async ({ page }) => {
    await page.goto('/');
    await expect(story(page)).toHaveAttribute('data-story-mode', 'static');
    await reachStory(page);
    const compare = page.getByTestId('story-compare');
    await expect(compare.getByTestId('story-map')).toHaveCount(2, { timeout: 30_000 });
    await compare.scrollIntoViewIfNeeded();
    const maps = compare.getByTestId('story-map');
    await expect(maps).toHaveCount(2, { timeout: 30_000 });
    await expect(compare.getByText('Resumo', { exact: true })).toBeVisible();
    await expect(compare.getByText('Município a município', { exact: true })).toBeVisible();
    const a = (await maps.nth(0).boundingBox())!;
    const b = (await maps.nth(1).boundingBox())!;
    // Same row: the two maps overlap vertically (labels may wrap differently).
    expect(b.y).toBeLessThan(a.y + a.height / 2);
    expect(a.y).toBeLessThan(b.y + b.height / 2);
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    const overflow = await page.evaluate(
      'document.documentElement.scrollWidth > document.documentElement.clientWidth',
    );
    expect(overflow).toBe(false);
  });
});

test.describe('narrativa — movimento reduzido', () => {
  test.skip(({ isMobile }) => isMobile, 'um projeto basta');

  test('sem painel fixo: cinco mapas estáticos, um por momento (2 no momento 2)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const section = story(page);
    await reachStory(page);
    await expect(section).toHaveAttribute('data-story-mode', 'static');
    await expect(page.getByTestId('story-sticky')).toHaveCount(0);
    await expect(section.getByTestId('story-map')).toHaveCount(5, { timeout: 30_000 });
    for (const n of [1, 2, 4, 5])
      await expect(
        section.locator(`li[data-step="${n}"] [data-testid="story-map"]`).first(),
      ).toBeAttached();
    await expect(section.locator('li[data-step="3"] [data-testid="story-map"]')).toHaveCount(0);
    await expect(section.locator('li[data-step="3"] [data-testid="story-absence"]')).toBeVisible();
  });
});
