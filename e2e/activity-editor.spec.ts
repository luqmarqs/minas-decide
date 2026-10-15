/**
 * D53: address search in the activity editor (/criar-atividade; the admin "Nova atividade" tab renders the same editor). The geocode API is mocked with page.route: Google and Photon are never
 * reached. Signing in needs the Clerk SECRET of the instance the local Worker uses (read from the
 * environment or from the gitignored .dev.vars); without it the tests are skipped, not faked.
 * Nothing is submitted, so no data is written.
 */
import { readFileSync } from 'node:fs';
import { createClerkClient } from '@clerk/backend';
import { expect, test, type Page } from '@playwright/test';

function clerkSecret(): string | undefined {
  if (process.env.CLERK_SECRET_KEY) return process.env.CLERK_SECRET_KEY;
  try {
    const m = /^CLERK_SECRET_KEY=(.+)$/m.exec(readFileSync('.dev.vars', 'utf8'));
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const SECRET = clerkSecret();
const VALIDATOR = (process.env.E2E_ADMIN_EMAIL ?? 'validador@minasdecide.com.br').toLowerCase();

interface ClerkGlobal {
  Clerk?: {
    loaded?: boolean;
    client?: {
      signIn: {
        create(o: { strategy: string; ticket: string }): Promise<{
          status: string;
          createdSessionId: string;
        }>;
      };
    };
    setActive(o: { session: string }): Promise<void>;
  };
}

async function signInAsValidator(page: Page) {
  const clerk = createClerkClient({ secretKey: SECRET! });
  const found = await clerk.users.getUserList({ emailAddress: [VALIDATOR], limit: 1 });
  const user = found.data[0];
  test.skip(!user, `usuário validador ${VALIDATOR} não existe nesta instância do Clerk`);
  const { token } = await clerk.signInTokens.createSignInToken({
    userId: user!.id,
    expiresInSeconds: 600,
  });
  await page.goto('/entrar', { waitUntil: 'load' });
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as ClerkGlobal).Clerk?.loaded),
    null,
    { timeout: 30_000 },
  );
  const status = await page.evaluate(async (ticket) => {
    const c = (globalThis as unknown as ClerkGlobal).Clerk!;
    const res = await c.client!.signIn.create({ strategy: 'ticket', ticket });
    if (res.status === 'complete') await c.setActive({ session: res.createdSessionId });
    return res.status;
  }, token);
  expect(status).toBe('complete');
}

/**
 * The editor lives at /criar-atividade for a registered user. The Clerk session is real; GET /me is
 * mocked as "registered organizer" so the page does not depend on the local Worker accepting the
 * token (a Clerk token is rejected when the dev machine clock drifts more than 60 s).
 */
async function openEditor(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill(
      ok({
        user_id: 'user_e2e',
        display_name: 'Pessoa E2E',
        email_masked: 'e2***@exemplo.com.br',
        email_verified: true,
        is_anonymous: false,
        selected_territory_id: null,
        is_admin: false,
        account_state: 'active',
        phone_masked: null,
        profile_review_required: false,
        registration_required: false,
      }),
    ),
  );
  await page.goto('/criar-atividade');
}

const SUGGESTION = {
  id: 'osm-W559449115',
  label: 'Praça da Liberdade',
  secondary: 'Savassi, Belo Horizonte',
  place: {
    label: 'Praça da Liberdade, Savassi, Belo Horizonte',
    street: null,
    number: null,
    neighborhood: 'Savassi',
    city: 'Belo Horizonte',
    coordinates: [-43.938041, -19.931872],
  },
};

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ data, meta: { request_id: 'e2e' } }),
});

test.describe('editor de atividade: busca de endereço', () => {
  test.skip(!SECRET, 'CLERK_SECRET_KEY ausente: sem sessão não há editor para testar');

  test('autocomplete preenche endereço, ponto, cidade e abre o mapa; link fora de MG dá erro', async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text()))
        problems.push(`csp: ${m.text().slice(0, 160)}`);
    });
    const searches: string[] = [];
    await page.route('**/api/v1/geocode?**', (route) => {
      searches.push(new URL(route.request().url()).searchParams.get('q') ?? '');
      return route.fulfill(ok({ provider: 'photon', items: [SUGGESTION] }));
    });
    await page.route('**/api/v1/geocode/resolve?**', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNPROCESSABLE', message: 'Este local fica fora de Minas Gerais.' },
          meta: { request_id: 'e2e' },
        }),
      }),
    );

    await signInAsValidator(page);
    await openEditor(page);

    const address = page.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await expect(address).toBeVisible({ timeout: 30_000 });
    await address.fill('praca da liberdade');
    const option = page.getByRole('option', { name: /Praça da Liberdade/ });
    await expect(option).toBeVisible();
    expect(searches).toEqual(['praca da liberdade']); // debounced: a single request
    await expect(page.getByText('Busca de endereços © OpenStreetMap (Photon)')).toBeVisible();

    await option.click();
    await expect(address).toHaveValue(SUGGESTION.place.label);
    await expect(page.getByText(/Selecionado:/)).toContainText('Belo Horizonte', {
      timeout: 20_000,
    });
    await expect(page.getByRole('application', { name: /Mapa para marcar o ponto/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('checkbox', { name: /Confirmo que o ponto \(-19\.93187, -43\.93804\)/ }),
    ).not.toBeChecked();

    // coordinates stay behind "Ajustar coordenadas manualmente"
    await expect(page.getByLabel(/^Latitude/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Ajustar coordenadas manualmente' }).click();
    await expect(page.getByLabel(/^Latitude/)).toHaveValue('-19.931872');

    // a pasted link outside MG: clear error, the point is not touched
    await address.fill('https://www.google.com/maps/@-23.5505,-46.6333,15z');
    await expect(page.getByRole('alert').filter({ hasText: /fora de Minas Gerais/ })).toBeVisible();
    await expect(page.getByLabel(/^Latitude/)).toHaveValue('-19.931872');
    expect(problems).toEqual([]);
  });

  test('link do Google Maps preenche o ponto; falha da busca não impede digitar', async ({
    page,
  }) => {
    await page.route('**/api/v1/geocode?**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Busca indisponível.' },
          meta: { request_id: 'e2e' },
        }),
      }),
    );
    await page.route('**/api/v1/geocode/resolve?**', (route) =>
      route.fulfill(
        ok({
          coordinates: [-43.9386, -19.9191],
          place: { ...SUGGESTION.place, label: 'Praça Sete, Centro, Belo Horizonte' },
          provider: 'photon',
        }),
      ),
    );
    await signInAsValidator(page);
    await openEditor(page);
    const address = page.getByRole('combobox', { name: /Endereço ou ponto de encontro/ });
    await expect(address).toBeVisible({ timeout: 30_000 });

    await address.fill('rua sem busca');
    await expect(page.getByText(/Você pode digitar o endereço manualmente/)).toBeVisible();
    await expect(address).toHaveValue('rua sem busca');

    await address.fill('https://www.google.com/maps/@-19.9191,-43.9386,17z');
    await expect(address).toHaveValue('Praça Sete, Centro, Belo Horizonte');
    await expect(page.getByText(/Ponto do link aplicado/)).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /Confirmo que o ponto \(-19\.91910, -43\.93860\)/ }),
    ).toBeVisible();
  });
});
