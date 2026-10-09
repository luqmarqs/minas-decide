import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  };
}

const proposal = {
  id: PROPOSAL_ID,
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
    expect(await screen.findByText(/verificação em duas etapas/)).toBeInTheDocument();
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
    // Group management becomes available for the created group.
    await waitFor(() =>
      expect(screen.getByText('Adicionar responsável (privado)')).toBeInTheDocument(),
    );
  });

  it('without a session asks to sign in by e-mail', async () => {
    sb.current = createFakeSupabase(null);
    stubFetch();
    renderAdmin();
    expect(await screen.findByText(/Área restrita/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entrar por e-mail' })).toBeInTheDocument();
  });
});
