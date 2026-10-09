/**
 * Smoke of the registration form and Clerk sign-in (ADR 0005). No real code is ever sent:
 * the code-step test uses a Clerk *test e-mail* (`+clerk_test`), for which the dev instance
 * sends no e-mail; it stops at the code screen, so no Clerk user and no profile are created
 * (only an abandoned sign-up attempt, which Clerk expires).
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

test('participar: valid form reaches the Clerk code step (test e-mail, no code sent)', async ({
  page,
}) => {
  // Clerk bot protection (Smart CAPTCHA) rejects automated browsers. Clerk's official way
  // around it in e2e is a Testing Token (Backend API, needs CLERK_SECRET_KEY — never in the
  // repo): export CLERK_TESTING_TOKEN=<token> to run this test; it is appended to Frontend
  // API requests exactly like @clerk/testing does.
  const testingToken = process.env.CLERK_TESTING_TOKEN;
  test.skip(!testingToken, 'CLERK_TESTING_TOKEN ausente: captcha do Clerk bloqueia automação');
  await page.route(/\.clerk\.accounts\.dev\/v1\//, async (route) => {
    const u = new URL(route.request().url());
    u.searchParams.set('__clerk_testing_token', testingToken ?? '');
    const response = await route.fetch({ url: u.toString() });
    let json: { response?: { captcha_bypass?: boolean }; client?: { captcha_bypass?: boolean } };
    try {
      json = (await response.json()) as typeof json;
    } catch {
      return route.fulfill({ response });
    }
    if (json.response?.captcha_bypass === false) json.response.captcha_bypass = true;
    if (json.client?.captcha_bypass === false) json.client.captcha_bypass = true;
    return route.fulfill({ response, json });
  });
  const posts: string[] = [];
  const csp: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/v1/registrations')) posts.push(r.url());
  });
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
  });
  await page.goto('/participar?territorio=mg-3140001-centro');
  await page.getByLabel(/^Nome/).fill('Teste E2E');
  await page.getByLabel(/^E-mail/).fill(`e2e-${Date.now()}+clerk_test@example.com`);
  await page.getByLabel(/^WhatsApp/).fill('(31) 99999-8888');
  await page.getByRole('checkbox', { name: /Li e aceito/ }).click();
  // Local/dev Turnstile uses Cloudflare's always-pass test key.
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  const code = page.getByLabel(/^Código de verificação/);
  await expect(code).toBeVisible({ timeout: 20_000 });
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(page.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trocar e-mail' })).toBeVisible();
  expect(posts).toHaveLength(0);
  expect(csp).toEqual([]);
});

test('entrar: e-mail step is accessible and links to sign-up', async ({ page }) => {
  await page.goto('/entrar?next=/criar-atividade');
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
  const email = page.getByLabel(/^E-mail/);
  await expect(email).toHaveAttribute('autocomplete', 'email');
  await page.getByRole('button', { name: 'Receber código' }).click();
  await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
  await expect(email).toBeFocused();
  await expect(page.getByRole('link', { name: 'Cadastre-se para participar' })).toHaveAttribute(
    'href',
    '/participar',
  );
});

test('criar-atividade without session offers "Entrar com código" and "Criar conta"', async ({
  page,
}) => {
  await page.goto('/criar-atividade');
  await expect(page.getByRole('link', { name: 'Entrar com código' })).toHaveAttribute(
    'href',
    '/entrar?next=%2Fcriar-atividade',
    { timeout: 15_000 },
  );
  await expect(page.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
    'href',
    '/participar',
  );
});

test('legacy /autenticacao/retorno redirects to /entrar and never out', async ({ page }) => {
  await page.goto('/autenticacao/retorno?next=https%3A%2F%2Fevil.example');
  await expect(page).toHaveURL(/\/entrar$/);
  expect(page.url()).not.toContain('evil');
});
