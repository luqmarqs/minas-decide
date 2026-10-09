/**
 * Round 2 (FE-3) smoke: deferred map start, dark basemap, removed account security route and
 * no horizontal overflow on the new pages. No submits (no Auth users created).
 */
import { expect, test } from '@playwright/test';

test('home paints hero + placeholder first, then starts the map after load/idle', async ({
  page,
  isMobile,
}) => {
  const early: string[] = [];
  page.on('request', (r) => {
    if (/territories-index|maplibre/.test(r.url())) early.push(r.url());
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // FE-10: MapLibre is not fetched while the map section is far below the fold (the
  // territory index may be: the sign-up section's territory field uses it)…
  await page.waitForTimeout(1500);
  expect(early.filter((u) => u.includes('maplibre'))).toHaveLength(0);
  // …the map (MapLibre chunk / list fallback) replaces the placeholder once it approaches.
  await page.locator('#mapa').scrollIntoViewIfNeeded();
  if (isMobile)
    await expect(page.getByTestId('layer-bar-trigger')).toContainText('Abstenção', {
      timeout: 20_000,
    });
  else
    await expect(page.getByRole('radio', { name: 'Abstenção', exact: true })).toBeChecked({
      timeout: 20_000,
    });
  await expect(page.getByTestId('map-placeholder')).toHaveCount(0);
  expect(early.length).toBeGreaterThan(0);
});

test('dark scheme uses the dark OpenFreeMap style', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  const styles: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('tiles.openfreemap.org/styles/')) styles.push(r.url());
  });
  await page.goto('/#mapa');
  await expect.poll(() => styles.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(styles.some((s) => s.endsWith('/styles/dark'))).toBe(true);
  expect(styles.some((s) => s.endsWith('/styles/positron'))).toBe(false);
  await ctx.close();
});

test('/conta/seguranca (removed, ADR 0005) redirects home without overflow', async ({ page }) => {
  await page.goto('/conta/seguranca');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    'document.documentElement.scrollWidth > document.documentElement.clientWidth',
  );
  expect(overflow).toBe(false);
});

test('territory page keeps the footer below the fold while loading (CLS)', async ({ page }) => {
  await page.goto('/territorio/mg-3140001');
  await expect(page.locator('footer')).toBeAttached();
  const footerTop = await page.evaluate(
    'Math.round(document.querySelector("footer").getBoundingClientRect().top)',
  );
  const vh = await page.evaluate('innerHeight');
  expect(Number(footerTop)).toBeGreaterThanOrEqual(Number(vh));
});
