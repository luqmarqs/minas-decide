import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_STATUS_FILTERS, GROUP_STATUS_FILTERS } from '@/features/admin/api';
import AdminPage from '@/pages/admin/AdminPage';
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

const PROPOSAL_ID = '77777777-7777-4777-8777-777777777777';
const GROUP_ID = '88888888-8888-4888-8888-888888888888';

function me(isAdmin: boolean) {
  return {
    user_id: USER_ID,
    display_name: 'Admin',
    email_masked: 'ad***@exemplo.com.br',
    email_verified: true,
    is_anonymous: false,
    selected_territory_id: null,
    is_admin: isAdmin,
    account_state: 'active',
    phone_masked: null,
    profile_review_required: false,
  };
}

const proposal = {
  id: PROPOSAL_ID,
  group_id: null as string | null,
  territory_id: 'mg-3106200-centro',
  name_proposed: 'Centro BH',
  join_url_proposed: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOp',
  proposer_name: 'João',
  proposer_email_masked: 'jo***@exemplo.com.br',
  proposer_phone_masked: '+55 (31) 9****-**77',
  status: 'pending',
  created_at: '2026-10-08T12:00:00Z',
  reviewed_at: null,
  review_reason: null,
};

function renderAdmin() {
  return renderRoutes([{ path: '/admin/*', element: <AdminPage /> }], '/admin');
}

beforeEach(() => {
  sb.current = createFakeSupabase(makeSession({ anonymous: false }));
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('/admin', () => {
  it('non-admin sees "sem permissão" and no queue request is made', async () => {
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(ok(me(false))) : undefined,
    );
    renderAdmin();
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/admin')).toHaveLength(0);
  });

  it('403 from the queue (e.g. no MFA) shows a clear message', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(
          apiError('FORBIDDEN', 403, 'Você não tem permissão para esta ação.'),
        );
      return undefined;
    });
    renderAdmin();
    expect(await screen.findByText(/A tentativa foi registrada/)).toBeInTheDocument();
    // No factor yet: the gate lets the panel load but points to enrolment.
    expect(screen.getByRole('link', { name: /ativar em Segurança da conta/ })).toHaveAttribute(
      'href',
      '/conta/seguranca',
    );
  });

  it('review shows public vs private (masked) and approval requires a reason + confirmation', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [proposal], next_cursor: null }));
      if (url === `/api/v1/admin/groups/${PROPOSAL_ID}/approve` && init?.method === 'POST')
        return Promise.resolve(
          ok({ proposal_id: PROPOSAL_ID, group_id: GROUP_ID, status: 'active' }),
        );
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('Público (após aprovação)')).toBeInTheDocument();
    expect(screen.getByText('Privado (só administração)')).toBeInTheDocument();
    expect(screen.getByText('jo***@exemplo.com.br')).toBeInTheDocument();
    expect(screen.getByText('+55 (31) 9****-**77')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Confirmar aprovação');
    await user.click(screen.getAllByRole('button', { name: 'Aprovar' }).at(-1)!);
    expect(await screen.findByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(callsTo(fetchMock, `/api/v1/admin/groups/${PROPOSAL_ID}/approve`)).toHaveLength(0);

    await user.type(screen.getByLabelText(/^Motivo/), 'Link e território conferidos');
    await user.click(screen.getAllByRole('button', { name: 'Aprovar' }).at(-1)!);
    expect(await screen.findByText(/Proposta aprovada/)).toBeInTheDocument();
    const [, init] = firstCallTo(fetchMock, `/api/v1/admin/groups/${PROPOSAL_ID}/approve`);
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Link e território conferidos' });
    // Group management uses the group id returned by the approval (no URL matching).
    await user.click(screen.getByRole('button', { name: 'Gerenciar grupo' }));
    await waitFor(() =>
      expect(screen.getByText('Adicionar responsável (privado)')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Suspender grupo' })).toBeInTheDocument();
  });

  it('MfaGate: with a verified factor and an aal1 session, asks the code BEFORE loading the panel', async () => {
    const fake = createFakeSupabase(makeSession({ anonymous: false })).withVerifiedFactor();
    sb.current = fake;
    const fetchMock = stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    expect(
      await screen.findByRole('heading', { name: 'Confirme o segundo fator' }),
    ).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/admin')).toHaveLength(0);

    const input = screen.getByLabelText(/Código de 6 números/);
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: 'Verificar e continuar' }));
    expect(await screen.findByText(/Código incorreto ou expirado/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/admin')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar e continuar' }));
    expect(await screen.findByText('Nenhuma proposta neste status.')).toBeInTheDocument();
    expect(fake.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'factor-verified' });
    expect(fake.auth.mfa.verify).toHaveBeenLastCalledWith({
      factorId: 'factor-verified',
      challengeId: 'challenge-1',
      code: '123456',
    });
    expect(fake.auth.refreshSession).toHaveBeenCalled();
    expect(callsTo(fetchMock, '/api/v1/admin/queue').length).toBeGreaterThan(0);
  });

  it('status filter offers "Suspensos"; a suspended group can be reactivated with reason', async () => {
    const suspended = { ...proposal, status: 'suspended', group_id: GROUP_ID };
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [suspended], next_cursor: null }));
      if (url === `/api/v1/admin/groups/${GROUP_ID}/unsuspend` && init?.method === 'POST')
        return Promise.resolve(
          ok({ id: GROUP_ID, status: 'active', updated_at: '2026-10-09T10:00:00Z' }),
        );
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    // (Radix Select does not open in jsdom: assert the options it renders from.)
    expect(GROUP_STATUS_FILTERS).toContainEqual({ value: 'suspended', label: 'Suspensos' });
    expect(ACTIVITY_STATUS_FILTERS).toContainEqual({ value: 'suspended', label: 'Suspensas' });
    expect(await screen.findByText('Suspenso')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    await user.click(screen.getByRole('button', { name: 'Reativar grupo' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Confirmar reativação');
    await user.type(screen.getByLabelText(/^Motivo/), 'Denúncia improcedente');
    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    expect(await screen.findByText(/Suspensão retirada/)).toBeInTheDocument();
    const [, init] = firstCallTo(fetchMock, `/api/v1/admin/groups/${GROUP_ID}/unsuspend`);
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Denúncia improcedente' });
    // Uses the proposal's group_id, never the public /groups lookup.
    expect(callsTo(fetchMock, '/api/v1/groups')).toHaveLength(0);
  });

  it('suspends a published activity with reason + confirmation', async () => {
    const activity = {
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Caminhada',
      type: 'caminhada',
      description: 'Descrição',
      territory_id: 'mg-3106200-centro',
      public_address: 'Praça Sete',
      starts_at: '2030-01-15T17:30:00.000Z',
      status: 'published',
      creator_user_id: USER_ID,
      public_contact_opt_in: false,
      created_at: '2026-10-08T12:00:00Z',
      reviewed_at: null,
      review_reason: null,
      version: 2,
    };
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue?kind=groups'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'activities', items: [activity], next_cursor: null }));
      if (url === `/api/v1/admin/activities/${activity.id}/suspend` && init?.method === 'POST')
        return Promise.resolve(ok({ id: activity.id, status: 'suspended', version: 3 }));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('tab', { name: 'Atividades' }));
    await user.click(await screen.findByRole('button', { name: 'Revisar' }));
    await user.click(screen.getByRole('button', { name: 'Suspender atividade' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Confirmar suspensão');
    await user.type(screen.getByLabelText(/^Motivo/), 'Local inseguro');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText(/Atividade suspensa/)).toBeInTheDocument();
    const [, init] = firstCallTo(fetchMock, `/api/v1/admin/activities/${activity.id}/suspend`);
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Local inseguro' });
    expect(
      screen.getByRole('button', { name: /Reativar \(volta para análise\)/ }),
    ).toBeInTheDocument();
  });

  it('reveal contact: confirmation, audited call, clear text with warning, hidden again', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [proposal], next_cursor: null }));
      if (
        url === `/api/v1/admin/group-proposals/${PROPOSAL_ID}/reveal-contact` &&
        init?.method === 'POST'
      )
        return Promise.resolve(
          ok({
            proposal_id: PROPOSAL_ID,
            proposer_email: 'joao@exemplo.com.br',
            proposer_phone: '+5531977776677',
            revealed_at: '2026-10-09T13:00:00Z',
          }),
        );
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Revisar' }));
    expect(screen.queryByText('joao@exemplo.com.br')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revelar contato do proponente' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(/registrado na auditoria/);
    expect(callsTo(fetchMock, '/api/v1/admin/group-proposals')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Revelar e registrar acesso' }));
    expect(await screen.findByText('joao@exemplo.com.br')).toBeInTheDocument();
    expect(screen.getByText('+5531977776677')).toBeInTheDocument();
    expect(screen.getByText(/Acesso registrado na auditoria em/)).toBeInTheDocument();
    // Leaving the screen (closing the review) drops the contact from memory.
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.queryByText('joao@exemplo.com.br')).not.toBeInTheDocument();
  });

  it('reveal contact without aal2 → clear 403 message, nothing shown', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me(true)));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [proposal], next_cursor: null }));
      if (url.includes('/reveal-contact'))
        return Promise.resolve(apiError('FORBIDDEN', 403, 'Confirme o segundo fator (MFA).'));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Revisar' }));
    await user.click(screen.getByRole('button', { name: 'Revelar contato do proponente' }));
    await user.click(await screen.findByRole('button', { name: 'Revelar e registrar acesso' }));
    expect(await screen.findByText(/confirmado o segundo fator \(MFA\)/)).toBeInTheDocument();
  });

  it('without a session asks to sign in by e-mail', async () => {
    sb.current = createFakeSupabase(null);
    stubFetch();
    renderAdmin();
    expect(await screen.findByText(/Área restrita/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entrar por e-mail' })).toBeInTheDocument();
  });
});
