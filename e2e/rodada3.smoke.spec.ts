/**
 * Round 3 (FE-6) smoke: hero search → map zoom + panel (desktop side panel / mobile sheet),
 * activities always on the map with a popover carrying "Eu vou", terminals overlay with OSM
 * attribution, narrative section and key numbers. Uses the real snapshot when present and the
 * real local API (example activities seeded by scripts/db/seed-example-activities.ts). Never
 * clicks "Eu vou" (no writes).
 */
import { expect, test, type Page } from '@playwright/test';

const mapZoom = async (page: Page): Promise<number> =>
  Number((await page.locator('[data-zoom]').first().getAttribute('data-zoom')) ?? 'NaN');

test('hero search zooms the map to the territory and opens the panel', async ({ page }, info) => {
  await page.goto('/');
  // Map started (after idle) and settled on the whole state.
  await expect(page.locator('[data-zoom]')).toHaveCount(1, { timeout: 30_000 });
  const before = await mapZoom(page);
  const input = page.getByRole('combobox', { name: /Cidade ou bairro/ });
  await input.fill('Juiz de Fora');
  await expect(page.getByRole('option').first()).toContainText('Juiz de Fora');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/[?&]t=mg-3136702(&|$)/);
  await expect.poll(() => mapZoom(page), { timeout: 15_000 }).toBeGreaterThan(before + 1.5);
  if (info.project.name === 'mobile') {
    // Sheet opens (half state) and the map is scrolled up under the header.
    await expect(page.getByRole('dialog', { name: 'Juiz de Fora' })).toBeVisible();
    const top = await page.locator('#mapa').evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThan(120);
  } else {
    await expect(
      page.getByRole('navigation', { name: 'Localização do território' }).first(),
    ).toContainText('Juiz de Fora');
  }
});

test('activity markers stay on any layer and open a popover with "Eu vou"', async ({
  page,
}, info) => {
  // BH neighborhoods at zoom 13 where the Rodoviária example is an unclustered sun marker
  // inside the free part of the map: east of the desktop legend; on phones, in the band
  // between the layer selector and the half-open sheet.
  const t = info.project.name === 'mobile' ? 'mg-3106200-floresta' : 'mg-3106200';
  await page.goto(`/?t=${t}&camada=lula-bolsonaro`);
  await expect(page.getByRole('switch', { name: /Atividades/ })).toHaveAttribute(
    'aria-checked',
    'true',
    { timeout: 30_000 },
  );
  // The narrative and key numbers sit between hero and map: bring the map into view.
  await page.locator('#mapa').scrollIntoViewIfNeeded();
  const canvasBox = page.locator('[data-activity-points]');
  // A sun marker that is not covered by the selector/legend/panel/sheet overlays (the camera
  // re-frames after the scroll on mobile, so poll).
  const findTarget = async () => {
    const pts = JSON.parse((await canvasBox.getAttribute('data-activity-points')) ?? '[]') as {
      x: number;
      y: number;
    }[];
    const box = (await canvasBox.boundingBox())!;
    for (const p of pts) {
      const x = box.x + p.x;
      const y = box.y + p.y;
      const onCanvas = await page.evaluate(
        `document.elementFromPoint(${x}, ${y})?.tagName === 'CANVAS'`,
      );
      if (onCanvas) return { x, y };
    }
    return null;
  };
  await expect.poll(findTarget, { timeout: 30_000 }).not.toBeNull();
  // Let the camera settle (the phone layout re-frames after the scroll), then read again.
  await page.waitForTimeout(2000);
  await expect.poll(findTarget, { timeout: 15_000 }).not.toBeNull();
  const target = (await findTarget())!;
  if (info.project.name === 'mobile') await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  const pop = page.getByTestId('activity-popover');
  await expect(pop).toBeVisible();
  // Also checks the sheet keeps the page accessible (no aria-hidden over the map on phones).
  await expect(pop.getByRole('button', { name: 'Eu vou' })).toBeVisible();
  await expect(pop.getByText(/horário de Brasília/)).toBeVisible();
  if (info.project.name === 'mobile')
    await pop.getByRole('button', { name: 'Fechar atividade' }).tap();
  else await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
});

test('terminals overlay is off by default and credits OpenStreetMap when on', async ({ page }) => {
  await page.goto('/');
  const sw = page.getByRole('switch', { name: /Terminais/ });
  await expect(sw).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
  await sw.click();
  await expect(page).toHaveURL(/terminais=1/);
  const legend = page.getByTestId('legend-pois');
  await expect(legend).toContainText('© OpenStreetMap contributors (ODbL)');
  await expect(legend).toContainText(/\d+ locais/);
});

test('home shows the narrative steps and the key numbers before the map', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Minas decide Lula.');
  await expect(
    page.getByRole('heading', { name: 'O mapa do primeiro turno assusta' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Por que Minas decide' })).toBeVisible();
  await expect(page.getByTestId('story-map').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('footer-responsavel')).toContainText('[a definir');
  const overflow = await page.evaluate(
    'document.documentElement.scrollWidth > document.documentElement.clientWidth',
  );
  expect(overflow).toBe(false);
});

test('FE-7: header "Participar" scrolls to the sign-up at the end of the home', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Participar' }).click();
  await expect(page).toHaveURL(/#participar$/);
  const title = page.getByRole('heading', { name: 'Entre para a campanha em Minas' });
  await expect(title).toBeInViewport({ timeout: 10_000 });
  await expect(title).toBeFocused();
  await expect(page.getByTestId('home-participar').getByLabel(/^Nome/)).toBeVisible({
    timeout: 20_000,
  });
});

test('FE-8: Mariana shows approximate neighborhood areas; choosing Centro outlines it', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByRole('combobox', { name: /Cidade ou bairro/ });
  await input.fill('Mariana');
  await expect(page.getByRole('option').first()).toContainText('Mariana');
  await page
    .getByRole('option', { name: /^Mariana\/MG/ })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]t=mg-3140001(&|$)/);
  const map = page.locator('[data-neighborhood-areas]');
  await expect
    .poll(async () => Number((await map.getAttribute('data-neighborhood-areas')) ?? '0'), {
      timeout: 30_000,
    })
    .toBeGreaterThan(5);
  // Search the neighborhood (same flow as clicking an area).
  await input.fill('Centro Mariana');
  await page
    .getByRole('option', { name: /^Centro — Mariana/ })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]t=mg-3140001-centro(&|$)/);
  await expect
    .poll(async () => (await map.getAttribute('data-selected-area')) ?? '', { timeout: 30_000 })
    .toBe('mg-3140001-centro');
  // Panel/legend note (on phones it sits in the collapsed legend or lower in the sheet).
  await expect(page.getByText(/pelos locais de votação \(Voronoi\)/).first()).toBeAttached();
});
