import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saoPauloLocalToUtcIso,
  saoPauloOffsetLabel,
  utcIsoToSaoPauloLocal,
} from '@/features/activities/api';
import { draftKey, writeDraft } from '@/features/activities/draftStore';
import CriarAtividadePage from '@/pages/CriarAtividadePage';
import MinhasAtividadesPage from '@/pages/MinhasAtividadesPage';
import { stubFetch } from './utils';
import {
  apiError,
  callsTo,
  firstCallTo,
  createFakeSupabase,
  installTurnstile,
  makeSession,
  ok,
  renderRoutes,
  uninstallTurnstile,
  USER_ID,
} from './fe2Helpers';

const sb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => sb.current,
  isSupabaseConfigured: () => true,
}));

const TERRITORY = 'mg-3106200-centro';
const ACT_ID = '55555555-5555-4555-8555-555555555555';

function me(verified: boolean) {
  return {
    user_id: USER_ID,
    display_name: 'Maria',
    email_masked: 'ma***@exemplo.com.br',
    email_verified: verified,
    is_anonymous: !verified,
    selected_territory_id: TERRITORY,
    is_admin: false,
    account_state: 'active',
    phone_masked: null,
    profile_review_required: false,
  };
}

function myActivity(over: Record<string, unknown> = {}) {
  return {
    id: ACT_ID,
    title: 'Panfletagem na praça',
    type: 'panfletagem',
    description_sanitized: 'Distribuição de material na praça central.',
    starts_at: '2030-01-15T17:30:00.000Z',
    ends_at: null,
    timezone: 'America/Sao_Paulo',
    location_public: 'Praça Sete, Centro',
    coordinates: [-43.9386, -19.9191],
    territory_id: TERRITORY,
    status: 'pending_review',
    rsvp_count_approx: 0,
    contact_public: null,
    updated_at: '2026-10-08T00:00:00Z',
    review_reason: null,
    version: 3,
    ...over,
  };
}

/** Seeds the per-user localStorage draft (P-UX-1). */
function seedDraft(data: Record<string, unknown>) {
  writeDraft(USER_ID, data);
}
const DRAFT_KEY = draftKey(USER_ID);

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('São Paulo local time ↔ UTC', () => {
  it('converts without silent shifts and back', () => {
    expect(saoPauloLocalToUtcIso('2030-01-15', '14:30')).toBe('2030-01-15T17:30:00.000Z');
    expect(saoPauloLocalToUtcIso('2026-12-31', '23:15')).toBe('2027-01-01T02:15:00.000Z');
    expect(utcIsoToSaoPauloLocal('2027-01-01T02:15:00.000Z')).toEqual({
      date: '2026-12-31',
      time: '23:15',
    });
    expect(saoPauloOffsetLabel('2030-01-15T17:30:00.000Z')).toBe('UTC−3');
    expect(saoPauloLocalToUtcIso('2030-13-01', '10:00')).toBeNull();
    expect(saoPauloLocalToUtcIso('2030-01-01', '25:00')).toBeNull();
  });
});

describe('/criar-atividade guard', () => {
  function renderCriar() {
    return renderRoutes(
      [{ path: '/criar-atividade', element: <CriarAtividadePage /> }],
      '/criar-atividade',
    );
  }

  it('no session → explains and links to /participar', async () => {
    sb.current = createFakeSupabase(null);
    stubFetch();
    renderCriar();
    expect(await screen.findByText(/e-mail verificado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fazer cadastro' })).toHaveAttribute(
      'href',
      '/participar',
    );
  });

  it('T06: provisional session sees the verification screen; draft is kept, submit blocked', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: true }));
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(ok(me(false))) : undefined,
    );
    const user = userEvent.setup();
    renderCriar();
    expect(await screen.findByText('Verifique seu e-mail para continuar')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Reenviar link de confirmação' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Título/), 'Caminhada no bairro');
    await waitFor(() =>
      expect(window.localStorage.getItem(DRAFT_KEY)).toContain('Caminhada no bairro'),
    );
    expect(screen.getByRole('button', { name: 'Enviar para análise' })).toBeDisabled();
    expect(callsTo(fetchMock, '/api/v1/activities')).toHaveLength(0);
  });

  it('verified: validates, converts local time to UTC and ends in "enviada para análise"', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false, email: 'm@exemplo.com.br' }));
    seedDraft({
      title: 'Panfletagem na praça',
      type: 'panfletagem',
      description: 'Distribuição de material na praça central.',
      territoryId: TERRITORY,
      address: 'Praça Sete, Centro',
      lon: '-43.9386',
      lat: '-19.9191',
      confirmed: true,
      date: '2030-01-15',
      startTime: '14:30',
      endTime: '16:00',
      contactOptIn: true,
      contactType: 'instagram',
      contactValue: 'coletivo.centro',
    });
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url === '/api/v1/activities' && init?.method === 'POST')
        return Promise.resolve(ok(myActivity({ ends_at: '2030-01-15T19:00:00.000Z' }), 201));
      return undefined;
    });
    const user = userEvent.setup();
    renderCriar();
    const submit = await screen.findByRole('button', { name: 'Enviar para análise' });
    // Draft restored, but the location confirmation must be given again.
    expect(screen.getByLabelText(/^Título/)).toHaveValue('Panfletagem na praça');
    expect(screen.getByText(/Prévia pública/)).toHaveTextContent('Instagram: @coletivo.centro');
    expect(screen.getByText(/Vai aparecer como/)).toHaveTextContent('14:30–16:00');

    await user.click(submit);
    expect(
      (await screen.findAllByText('Confirme que o ponto marcado corresponde ao local.')).length,
    ).toBeGreaterThan(0);
    expect(callsTo(fetchMock, '/api/v1/activities')).toHaveLength(0);

    await user.click(screen.getByRole('checkbox', { name: /Confirmo que o ponto/ }));
    await user.click(submit);
    expect(await screen.findByText('Atividade enviada para análise')).toBeInTheDocument();
    expect(screen.getByText('Ainda não está pública.')).toBeInTheDocument();
    const [, init] = firstCallTo(fetchMock, '/api/v1/activities');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      starts_at: '2030-01-15T17:30:00.000Z',
      ends_at: '2030-01-15T19:00:00.000Z',
      timezone: 'America/Sao_Paulo',
      coordinates: [-43.9386, -19.9191],
      location_confirmed: true,
      public_contact_opt_in: true,
      public_contact_type: 'instagram',
    });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('T18: API failure keeps the form and never shows success', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    seedDraft({
      title: 'Panfletagem na praça',
      type: 'panfletagem',
      description: 'Distribuição de material na praça central.',
      territoryId: TERRITORY,
      address: 'Praça Sete, Centro',
      lon: '-43.9386',
      lat: '-19.9191',
      date: '2030-01-15',
      startTime: '14:30',
    });
    stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url === '/api/v1/activities')
        return Promise.resolve(apiError('WRITES_SUSPENDED', 503, 'Envios suspensos.'));
      return undefined;
    });
    const user = userEvent.setup();
    renderCriar();
    await user.click(await screen.findByRole('checkbox', { name: /Confirmo que o ponto/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar para análise' }));
    expect(await screen.findByText(/temporariamente suspensos/)).toBeInTheDocument();
    expect(screen.queryByText('Atividade enviada para análise')).not.toBeInTheDocument();
  });
});

describe('/minhas-atividades', () => {
  function renderMinhas() {
    return renderRoutes(
      [{ path: '/minhas-atividades', element: <MinhasAtividadesPage /> }],
      '/minhas-atividades',
    );
  }

  it('lists statuses with rejection reason and cancels with confirmation + version', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    const items = [
      myActivity(),
      myActivity({
        id: '66666666-6666-4666-8666-666666666666',
        title: 'Reunião recusada',
        status: 'rejected',
        review_reason: 'Endereço residencial.',
      }),
    ];
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/my-activities'))
        return Promise.resolve(ok({ items, next_cursor: null }));
      if (url === `/api/v1/activities/${ACT_ID}/cancel` && init?.method === 'POST')
        return Promise.resolve(ok(myActivity({ status: 'cancelled', version: 4 })));
      return undefined;
    });
    const user = userEvent.setup();
    renderMinhas();
    expect(await screen.findByText('Em análise')).toBeInTheDocument();
    expect(screen.getByText('Não aprovada')).toBeInTheDocument();
    expect(screen.getByText('Endereço residencial.')).toBeInTheDocument();

    const first = screen.getByText('Panfletagem na praça').closest('li')!;
    await user.click(within(first).getByRole('button', { name: 'Cancelar atividade' }));
    expect(callsTo(fetchMock, `/api/v1/activities/${ACT_ID}/cancel`)).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Sim, cancelar atividade' }));
    expect(await screen.findByText('Atividade cancelada.')).toBeInTheDocument();
    const [, init] = firstCallTo(fetchMock, `/api/v1/activities/${ACT_ID}/cancel`);
    expect(JSON.parse(String(init.body))).toEqual({ version: 3 });
  });

  it('edit of a published activity warns about re-review and PATCHes only changes + version', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    const pub = myActivity({ status: 'published', rsvp_count_approx: 4 });
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/my-activities'))
        return Promise.resolve(ok({ items: [pub], next_cursor: null }));
      if (url === `/api/v1/activities/${ACT_ID}` && init?.method === 'PATCH')
        return Promise.resolve(
          ok({ ...pub, title: 'Panfletagem nova', status: 'pending_review', version: 4 }),
        );
      return undefined;
    });
    const user = userEvent.setup();
    renderMinhas();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByText(/voltar para análise/)).toBeInTheDocument();
    const title = screen.getByLabelText(/^Título/);
    await user.clear(title);
    await user.type(title, 'Panfletagem nova');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText(/voltou para análise e saiu do mapa/)).toBeInTheDocument();
    const [, init] = firstCallTo(fetchMock, `/api/v1/activities/${ACT_ID}`);
    expect(JSON.parse(String(init.body))).toEqual({ version: 3, title: 'Panfletagem nova' });
  });
});

describe('P-SEC-1 — pages blocked until the profile is reviewed', () => {
  const reviewMe = {
    ...me(true),
    profile_review_required: true,
    phone_masked: '+55 (31) 9****-**88',
  };

  it('/criar-atividade shows "Confira seus dados" and no editor until "Está correto"', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me' && init?.method === 'PATCH')
        return Promise.resolve(ok({ ...reviewMe, profile_review_required: false }));
      if (url === '/api/v1/me') return Promise.resolve(ok(reviewMe));
      return undefined;
    });
    const user = userEvent.setup();
    renderRoutes(
      [{ path: '/criar-atividade', element: <CriarAtividadePage /> }],
      '/criar-atividade',
    );
    expect(await screen.findByRole('heading', { name: 'Confira seus dados' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Título/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Está correto' }));
    expect(await screen.findByLabelText(/^Título/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/activities')).toHaveLength(0);
  });

  it('/minhas-atividades does not list anything before the review', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(ok(reviewMe)) : undefined,
    );
    renderRoutes(
      [{ path: '/minhas-atividades', element: <MinhasAtividadesPage /> }],
      '/minhas-atividades',
    );
    expect(await screen.findByRole('heading', { name: 'Confira seus dados' })).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/my-activities')).toHaveLength(0);
  });
});
