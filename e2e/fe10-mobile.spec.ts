import { expect, test, type Page } from '@playwright/test';

/**
 * FE-10 (D31): the map on phones. Pixel 7 project only, except the automatic
 * neighborhood areas (both projects). Visible map = viewport rows (8 px step) where
 * ≥ 50 % of the sampled points hit the MapLibre canvas (elementFromPoint), i.e. after
 * header, compact bar, legend chip and sheet.
 */
async function visibleMapRatio(page: Page): Promise<number> {
  // String expression: e2e is typechecked without the DOM lib.
  return page.evaluate<number>(`(() => {
    const step = 8;
    let rows = 0;
    let total = 0;
    for (let y = step / 2; y < innerHeight; y += step) {
      let hits = 0;
      let n = 0;
      for (let x = step / 2; x < innerWidth; x += step) {
        const el = document.elementFromPoint(x, y);
        n++;
        if (el && el.classList.contains('maplibregl-canvas')) hits++;
      }
      total++;
      if (hits / n >= 0.5) rows++;
    }
    return rows / total;
  })()`);
}

async function selectMariana(page: Page) {
  await page.goto('/');
  const input = page.getByRole('combobox', { name: /Cidade ou bairro/ });
  await input.fill('Mariana');
  await page
    .getByRole('option', { name: /^Mariana\/MG/ })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]t=mg-3140001(&|$)/);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-map-sheet]')).toHaveAttribute('data-state', 'collapsed');
  // Smooth scroll + camera settle.
  await expect
    .poll(
      () =>
        page.evaluate<number>(
          "Math.round(document.querySelector('#mapa').getBoundingClientRect().top)",
        ),
      {
        timeout: 10_000,
      },
    )
    .toBeLessThanOrEqual(60);
  await page.waitForTimeout(800);
}

test.describe('FE-10 mobile map', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('selecting Mariana leaves ≥ 55 % of the viewport as visible map, no overflow', async ({
    page,
  }) => {
    await selectMariana(page);
    const sheet = page.getByRole('dialog', { name: 'Mariana' });
    await expect(sheet).toHaveAttribute('aria-modal', 'false');
    await expect(sheet).toContainText(/Abstenção .*%/);
    expect(await visibleMapRatio(page)).toBeGreaterThanOrEqual(0.55);
    const bar = page.getByTestId('map-control-bar');
    expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    // The rest of the page is never hidden from assistive technology.
    await expect(page.locator('#mapa')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('legend chip expands into the full legend and closes with Esc', async ({ page }) => {
    await selectMariana(page);
    const chip = page.getByTestId('legend-chip');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await expect(chip).toContainText(/Abstenção · .*% – .*%/);
    await chip.click();
    const pop = page.getByTestId('legend-popover');
    await expect(pop).toBeVisible();
    await expect(pop).toContainText('Unidade:');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(chip).toBeFocused();
  });

  test('layer popover opens from the compact bar and closes on outside tap', async ({ page }) => {
    await selectMariana(page);
    await page.getByTestId('layer-bar-trigger').click();
    const pop = page.getByRole('dialog', { name: 'Camada do mapa' });
    await expect(pop).toBeVisible();
    await pop.getByText('Comparecimento', { exact: true }).click();
    await expect(page.getByTestId('layer-bar-trigger')).toContainText('Comparecimento');
    await page.mouse.click(200, 500); // on the map, outside the popover
    await expect(pop).toBeHidden();
  });

  test('sheet: tapping the handle opens half; the close button dismisses it', async ({ page }) => {
    await selectMariana(page);
    const sheet = page.locator('[data-map-sheet]');
    await page.getByTestId('sheet-handle').click({ position: { x: 200, y: 6 } });
    await expect(sheet).toHaveAttribute('data-state', 'half');
    await page.getByRole('button', { name: 'Fechar painel' }).click();
    await expect(sheet).toHaveCount(0);
  });

  test('activity popover sits above the sheet, full width, and closes on outside tap', async ({
    page,
  }) => {
    // Belo Horizonte: the seeded example activities (local API) are on screen.
    await page.goto('/?t=mg-3106200');
    await page.locator('#mapa').scrollIntoViewIfNeeded();
    const map = page.locator('[data-activity-points]');
    await expect(map).toBeAttached({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    const box = (await map.boundingBox())!;
    const pts = (
      JSON.parse((await map.getAttribute('data-activity-points')) ?? '[]') as {
        x: number;
        y: number;
      }[]
    ).filter((p) => p.y > 80 && p.y < box.height - 140);
    test.skip(!pts.length, 'no published activity on screen in this environment');
    await page.touchscreen.tap(box.x + pts[0]!.x, box.y + pts[0]!.y);
    const pop = page.getByTestId('activity-popover');
    await expect(pop).toBeVisible();
    const pb = (await pop.boundingBox())!;
    const sb = (await page.locator('[data-map-sheet]').boundingBox())!;
    expect(pb.y + pb.height).toBeLessThanOrEqual(sb.y + 1);
    expect(pb.width).toBeGreaterThan((page.viewportSize()?.width ?? 400) - 40);
    await page.mouse.click(200, 300);
    await expect(pop).toBeHidden();
  });
});

test('FE-10: zooming into Belo Horizonte without selecting shows neighborhood areas', async ({
  page,
}) => {
  await page.goto('/#mapa');
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const map = page.locator('[data-neighborhood-areas]');
  await expect(map).toBeAttached({ timeout: 30_000 });
  // Below zoom 10 (state view): only municipalities.
  expect(Number((await map.getAttribute('data-neighborhood-areas')) ?? '0')).toBe(0);
  await map.evaluate((el) =>
    el.dispatchEvent(
      new CustomEvent('mm-test-jump', { detail: { center: [-43.94, -19.92], zoom: 12 } }),
    ),
  );
  await expect
    .poll(async () => Number((await map.getAttribute('data-neighborhood-areas')) ?? '0'), {
      timeout: 30_000,
    })
    .toBeGreaterThan(20);
  await expect(page).not.toHaveURL(/[?&]t=/);
});
