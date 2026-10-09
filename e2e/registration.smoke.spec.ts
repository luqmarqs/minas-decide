/**
 * Smoke of the registration form (no real submit: Turnstile test tokens are single use
 * per 5 min on the shared TARGET dev, and a submit would create Auth users).
 * Checks accessible fields, pre-filled territory and client-side validation.
 */
import { expect, test } from '@playwright/test';

test('participar: accessible form, territory pre-filled, client errors block submit', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/v1/registrations')) posts.push(r.url());
  });
  await page.goto('/participar?territorio=mg-3140001-centro');
  const phone = page.getByLabel(/^WhatsApp/);
  await expect(phone).toHaveAttribute('inputmode', 'tel');
  await expect(phone).toHaveAttribute('autocomplete', 'tel');
  await expect(page.getByLabel(/^E-mail/)).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByText(/Selecionado:/)).toContainText('Mariana');
  await expect(page.getByRole('checkbox', { name: /Li e aceito/ })).not.toBeChecked();
  await expect(page.getByText('Verificação de segurança')).toBeVisible();

  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByText('Revise os campos abaixo')).toBeVisible();
  await expect(page.getByLabel(/^Nome/)).toBeFocused();
  expect(posts).toHaveLength(0);
});

test('criar-atividade without session explains and links to /participar', async ({ page }) => {
  await page.goto('/criar-atividade');
  // Under parallel load the session probe can take a few seconds; give it room.
  await expect(page.getByRole('link', { name: 'Fazer cadastro' })).toHaveAttribute(
    'href',
    '/participar',
    { timeout: 15_000 },
  );
});

test('autenticacao/retorno without params is invalid and never redirects out', async ({ page }) => {
  await page.goto('/autenticacao/retorno?next=https%3A%2F%2Fevil.example');
  await expect(page.getByText('Link inválido')).toBeVisible();
  expect(page.url()).not.toContain('evil');
});
