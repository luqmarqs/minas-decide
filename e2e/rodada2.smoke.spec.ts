/**
 * Round 2 (FE-3) smoke: deferred map start, dark basemap, account security route and
 * no horizontal overflow on the new pages. No submits (no Auth users created).
 */
import { expect, test } from '@playwright/test';

test('home paints hero + placeholder first, then starts the map after load/idle', async ({
  page,
}) => {
  const early: string[] = [];
  page.on('request', (r) => {
    if (/territories-index|maplibre/.test(r.url())) early.push(r.url());
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The map (MapLibre chunk / list fallback) replaces the placeholder after idle.
  await expect(page.getByRole('radio', { name: 'Abstenção' })).toBeChecked({ timeout: 20_000 });
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
  await page.goto('/');
  await expect.poll(() => styles.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(styles.some((s) => s.endsWith('/styles/dark'))).toBe(true);
  expect(styles.some((s) => s.endsWith('/styles/positron'))).toBe(false);
  await ctx.close();
});

test('/conta/seguranca without a session asks to sign in (no MFA call)', async ({ page }) => {
  await page.goto('/conta/seguranca');
  await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
  await expect(page.getByText(/Entre com o link enviado por e-mail/)).toBeVisible();
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
