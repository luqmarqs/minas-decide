/**
 * D49 (one registration; login without registration sees "Faça seu cadastro primeiro") and
 * D50 (admin "Nova atividade" publishes directly through POST /admin/activities).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeDraft } from '@/features/activities/draftStore';
import { SessionMenu } from '@/components/layouts/SessionMenu';
import AdminPage from '@/pages/admin/AdminPage';
import CriarAtividadePage from '@/pages/CriarAtividadePage';
import MinhasAtividadesPage from '@/pages/MinhasAtividadesPage';
import { stubFetch } from './utils';
import {
  callsTo,
  clerk,
  firstCallTo,
  installTurnstile,
  ok,
  renderRoutes,
  uninstallTurnstile,
  USER_ID,
} from './fe2Helpers';

const TERRITORY = 'mg-3106200-centro';
const ACT_ID = '55555555-5555-4555-8555-555555555555';

function me(over: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    display_name: null,
    email_masked: 'ma***@exemplo.com.br',
    email_verified: true,
    is_anonymous: false,
    selected_territory_id: null,
    is_admin: false,
    account_state: 'active',
    phone_masked: null,
    profile_review_required: false,
    registration_required: true,
    ...over,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('D49: signed in without a registration', () => {
  it('/criar-atividade shows "Faça seu cadastro primeiro" linking to the home form; no editor', async () => {
    clerk.signIn({ email: 'maria@exemplo.com.br' });
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(ok(me())) : undefined,
    );
    renderRoutes(
      [{ path: '/criar-atividade', element: <CriarAtividadePage /> }],
      '/criar-atividade',
    );
    expect(await screen.findByText(/Faça seu cadastro primeiro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fazer meu cadastro' })).toHaveAttribute(
      'href',
      '/#participar',
    );
    expect(screen.queryByRole('form', { name: 'Nova atividade' })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/activities')).toHaveLength(0);
  });

  it('/minhas-atividades shows the same notice and does not list', async () => {
    clerk.signIn({ email: 'maria@exemplo.com.br' });
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(ok(me())) : undefined,
    );
    renderRoutes(
      [{ path: '/minhas-atividades', element: <MinhasAtividadesPage /> }],
      '/minhas-atividades',
    );
    expect(await screen.findByText(/Faça seu cadastro primeiro/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/my-activities')).toHaveLength(0);
  });

  it('session menu offers only "Faça seu cadastro primeiro" (no organizer items)', async () => {
    clerk.signIn({ email: 'maria@exemplo.com.br', firstName: 'Maria' });
    stubFetch((url) => (url === '/api/v1/me' ? Promise.resolve(ok(me())) : undefined));
    const user = userEvent.setup();
    renderRoutes([{ path: '/', element: <SessionMenu /> }], '/');
    const button = await screen.findByRole('button', { name: /Maria|Minha conta/ });
    await user.click(button);
    const menu = await screen.findByRole('menu');
    expect(
      await within(menu).findByRole('menuitem', { name: 'Faça seu cadastro primeiro' }),
    ).toHaveAttribute('href', '/#participar');
    expect(within(menu).queryByRole('menuitem', { name: 'Propor atividade' })).toBeNull();
  });

  it('a registered organizer sees the editor (registration_required false)', async () => {
    clerk.signIn({ email: 'maria@exemplo.com.br' });
    stubFetch((url) =>
      url === '/api/v1/me'
        ? Promise.resolve(
            ok(
              me({
                registration_required: false,
                display_name: 'Maria',
                selected_territory_id: TERRITORY,
              }),
            ),
          )
        : undefined,
    );
    renderRoutes(
      [{ path: '/criar-atividade', element: <CriarAtividadePage /> }],
      '/criar-atividade',
    );
    expect(await screen.findByRole('button', { name: 'Enviar para análise' })).toBeInTheDocument();
    expect(screen.queryByText(/Faça seu cadastro primeiro/)).not.toBeInTheDocument();
  });
});

describe('D50: admin "Nova atividade"', () => {
  function published(over: Record<string, unknown> = {}) {
    return {
      id: ACT_ID,
      title: 'Caminhada pela virada',
      type: 'caminhada',
      description_sanitized: 'Caminhada com material da campanha.',
      starts_at: '2030-01-15T17:30:00.000Z',
      ends_at: null,
      timezone: 'America/Sao_Paulo',
      location_public: 'Praça Sete, Centro',
      coordinates: [-43.9386, -19.9191],
      territory_id: TERRITORY,
      status: 'published',
      rsvp_count_approx: 0,
      contact_public: null,
      updated_at: '2026-10-14T00:00:00Z',
      review_reason: null,
      version: 1,
      ...over,
    };
  }

  it('publishes through POST /admin/activities with an idempotency key, then "Atividade publicada"', async () => {
    clerk.signIn({ email: 'admin@exemplo.com.br', firstName: 'Admin' });
    writeDraft(`admin-${USER_ID}`, {
      title: 'Caminhada pela virada',
      type: 'caminhada',
      description: 'Caminhada com material da campanha.',
      territoryId: TERRITORY,
      address: 'Praça Sete, Centro',
      lon: '-43.9386',
      lat: '-19.9191',
      date: '2030-01-15',
      startTime: '14:30',
    });
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me')
        return Promise.resolve(ok(me({ is_admin: true, registration_required: true })));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === '/api/v1/admin/activities' && init?.method === 'POST')
        return Promise.resolve(ok(published(), 201));
      return undefined;
    });
    const user = userEvent.setup();
    renderRoutes([{ path: '/admin/*', element: <AdminPage /> }], '/admin');
    await user.click(await screen.findByRole('tab', { name: 'Nova atividade' }));
    expect(await screen.findByText(/publicadas na hora/)).toBeInTheDocument();
    await user.click(await screen.findByRole('checkbox', { name: /Confirmo que o ponto/ }));
    await user.click(screen.getByRole('button', { name: 'Publicar atividade' }));
    expect(await screen.findByText('Atividade publicada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver atividade' })).toHaveAttribute(
      'href',
      `/atividade/${ACT_ID}`,
    );
    expect(callsTo(fetchMock, '/api/v1/activities')).toHaveLength(0);
    const [, init] = firstCallTo(fetchMock, '/api/v1/admin/activities');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      title: 'Caminhada pela virada',
      territory_id: TERRITORY,
      location_confirmed: true,
    });
    expect(String(body.idempotency_key).length).toBeGreaterThanOrEqual(8);
    expect(body).not.toHaveProperty('turnstile_token');
  });
});
