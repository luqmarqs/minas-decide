/**
 * Redesign editorial — narrativa de 5 momentos (direção "A — Cartaz desdobrado").
 *
 * - Desktop: composição estática (D45 — o mapa fixo por rolagem foi desligado pelo proprietário);
 *   cada momento com o seu mapa.
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

test.describe('narrativa — desktop (composição estática, D45)', () => {
  test.skip(({ isMobile }) => isMobile, 'composição de desktop');

  test('sem mapa fixo: cada momento com o seu mapa, faixa oliva no momento 1, sem overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const section = story(page);
    await reachStory(page);
    await expect(section).toHaveAttribute('data-story-mode', 'static');
    await expect(page.getByTestId('story-sticky')).toHaveCount(0);
    await expect(section.locator('ol [data-testid="story-map"]').first()).toBeAttached({
      timeout: 30_000,
    });
    await expect(section.locator('ol [data-testid="story-map"]')).toHaveCount(5);
    await expect(section.locator('li[data-step="1"]')).toHaveClass(/ed-band-ink/);
    await centerStep(page, 3);
    await expect(page.getByTestId('story-absence')).toBeVisible();
    const overflow = await page.evaluate(
      'document.documentElement.scrollWidth > document.documentElement.clientWidth',
    );
    expect(overflow).toBe(false);
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
    // Summary small, mosaic large (legible).
    expect(b.width).toBeGreaterThan(a.width * 2);
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
