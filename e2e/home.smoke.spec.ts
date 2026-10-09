/**
 * Smoke test of the public reading flow (home → search → panel → territory page).
 * Works with the real snapshot or the DEMO fallback; does not depend on the API
 * (agenda/groups may show honest "indisponível" states).
 */
import { expect, test } from '@playwright/test';

test('home renders search, map (or list fallback), legend status and attribution', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Cidade ou bairro/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Abstenção' })).toBeChecked();
  // Official identity is the default (no query/localStorage needed).
  await expect(page).toHaveTitle(/Minas Decide/);
  await expect(page.locator('html')).toHaveAttribute('data-brand', 'minas-decide');
  await expect(page.getByRole('link', { name: 'Minas Decide — página inicial' })).toBeVisible();
  await expect(
    page.getByText(/Dados validados|Dados parciais|DADOS DEMONSTRATIVOS/).first(),
  ).toBeVisible();
  await expect(page.getByText(/OpenStreetMap contributors/).first()).toBeVisible();
  await expect(page.getByText(/Malha municipal: IBGE/).first()).toBeVisible();
  // String expression: e2e is typechecked without DOM lib.
  const overflow = await page.evaluate(
    'document.documentElement.scrollWidth > document.documentElement.clientWidth',
  );
  expect(overflow).toBe(false);
});

test('search selects a territory and the link restores it (T24)', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('combobox', { name: /Cidade ou bairro/ });
  await input.fill('centro');
  await expect(page.getByRole('option').first()).toContainText('Centro —');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/[?&]t=mg-\d{7}-centro/);
  const url = page.url();
  await page.goto(url);
  await expect(
    page.getByRole('navigation', { name: 'Localização do território' }).first(),
  ).toContainText('Centro');
});

test('list alternative is reachable without the map', async ({ page }) => {
  await page.goto('/?vista=lista');
  await expect(page.getByTestId('territory-list-fallback')).toBeVisible();
});

test('unknown route shows 404', async ({ page }) => {
  await page.goto('/rota-inexistente');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
