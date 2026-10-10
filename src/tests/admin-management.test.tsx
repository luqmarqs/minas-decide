import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from '@/pages/admin/AdminPage';
import { stubFetch } from './utils';
import {
  apiError,
  callsTo,
  clerk,
  headerOf,
  installTurnstile,
  ok,
  renderRoutes,
  uninstallTurnstile,
  USER_ID,
} from './fe2Helpers';

const OTHER_ID = 'user_2otherAdmin00000001';
const NEW_ID = 'user_2newAdmin000000001';

const me = {
  user_id: USER_ID,
  display_name: 'Admin',
  email_masked: 'ad***@exemplo.com.br',
  email_verified: true,
  is_anonymous: false,
  selected_territory_id: null,
  is_admin: true,
  account_state: 'active',
  phone_masked: null,
  profile_review_required: false,
};

const list = {
  items: [
    {
      user_id: USER_ID,
      email_masked: 'ad***@exemplo.com.br',
      status: 'active',
      created_at: '2026-10-01T12:00:00Z',
      created_by_masked: 'bootstrap',
      is_self: true,
    },
    {
      user_id: OTHER_ID,
      email_masked: 'ma***@exemplo.com.br',
      status: 'active',
      created_at: '2026-10-05T12:00:00Z',
      created_by_masked: 'ad***@exemplo.com.br',
      is_self: false,
    },
    {
      user_id: 'user_2ghostAdmin0000001',
      email_masked: null,
      status: 'missing',
      created_at: '2026-10-06T12:00:00Z',
      created_by_masked: null,
      is_self: false,
    },
  ],
};

function renderAdmin() {
  return renderRoutes([{ path: '/admin/*', element: <AdminPage /> }], '/admin');
}

async function rowFor(masked: string) {
  const rows = await screen.findAllByRole('listitem');
  const row = rows.find((r) => r.textContent?.includes(masked));
  if (!row) throw new Error(`row not found: ${masked}`);
  return row;
}

async function openAdminsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Administradores' }));
  await screen.findByRole('heading', { name: 'Administradores atuais' });
}

beforeEach(() => {
  clerk.signIn({ email: 'admin@exemplo.com.br', firstName: 'Admin' });
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('/admin — Administradores', () => {
  it('lists masked admins, marks self and users missing in Clerk', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    await rowFor('ma***@exemplo.com.br');
    expect(screen.getByText('sem usuário no Clerk')).toBeInTheDocument();
    expect(screen.getByText(/adicionado por bootstrap/)).toBeInTheDocument();
    // self: removal disabled with an explanation
    const selfRow = await rowFor('ad***@exemplo.com.br');
    expect(within(selfRow).getByRole('button', { name: /Remover/ })).toBeDisabled();
    expect(within(selfRow).getByText(/não pode remover o próprio acesso/)).toBeInTheDocument();
    const otherRow = await rowFor('ma***@exemplo.com.br');
    expect(within(otherRow).getByRole('button', { name: /Remover/ })).toBeEnabled();
  });

  it('adds an admin only after the confirmation and shows success after the server answer', async () => {
    let granted = false;
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === '/api/v1/admin/admins' && init?.method === 'POST') {
        granted = true;
        return Promise.resolve(
          ok({ user_id: NEW_ID, email_masked: 'no***@exemplo.com.br', created: true }, 201),
        );
      }
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    await user.type(screen.getByLabelText(/E-mail da pessoa/), '  Nova@Exemplo.com.br ');
    expect(screen.getByLabelText(/E-mail da pessoa/)).toHaveAttribute('autocomplete', 'email');
    await user.click(screen.getByRole('button', { name: 'Adicionar administrador' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/já ter conta criada em \/participar/);
    expect(dialog).toHaveTextContent(/acesso total à moderação e aos contatos/);
    // nothing sent yet, no success message yet
    expect(
      callsTo(fetchMock, '/api/v1/admin/admins').filter(([, i]) => i.method === 'POST'),
    ).toHaveLength(0);
    expect(screen.queryByText(/agora é administrador/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Conceder e registrar' }));
    expect(
      await screen.findByText(/no\*\*\*@exemplo\.com\.br agora é administrador/),
    ).toBeInTheDocument();
    expect(granted).toBe(true);
    const post = callsTo(fetchMock, '/api/v1/admin/admins').find(([, i]) => i.method === 'POST')!;
    expect(JSON.parse(String(post[1].body))).toEqual({ email: 'nova@exemplo.com.br' });
    expect(headerOf(post[1], 'Authorization')).toMatch(/^Bearer /);
  });

  it('invalid e-mail is blocked client-side without opening the dialog or calling the API', async () => {
    const fetchMock = stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    await user.type(screen.getByLabelText(/E-mail da pessoa/), 'sem-arroba');
    await user.click(screen.getByRole('button', { name: 'Adicionar administrador' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      callsTo(fetchMock, '/api/v1/admin/admins').filter(([, i]) => i.method === 'POST'),
    ).toHaveLength(0);
  });

  it('neutral 404: explains that the person needs an account and shows no success', async () => {
    stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === '/api/v1/admin/admins' && init?.method === 'POST')
        return Promise.resolve(apiError('NOT_FOUND', 404, 'Não encontrado.'));
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    await user.type(screen.getByLabelText(/E-mail da pessoa/), 'ninguem@exemplo.com.br');
    await user.click(screen.getByRole('button', { name: 'Adicionar administrador' }));
    await user.click(await screen.findByRole('button', { name: 'Conceder e registrar' }));
    expect(
      await screen.findByText(/Não encontramos uma conta com este e-mail/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/agora é administrador/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('unverified e-mail (400 with field) shows the server field message', async () => {
    stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === '/api/v1/admin/admins' && init?.method === 'POST')
        return Promise.resolve(
          apiError('VALIDATION_ERROR', 400, 'Revise os dados informados.', {
            email: 'O e-mail principal desta conta ainda não foi verificado.',
          }),
        );
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    await user.type(screen.getByLabelText(/E-mail da pessoa/), 'pendente@exemplo.com.br');
    await user.click(screen.getByRole('button', { name: 'Adicionar administrador' }));
    await user.click(await screen.findByRole('button', { name: 'Conceder e registrar' }));
    expect((await screen.findAllByText(/ainda não foi verificado/)).length).toBeGreaterThan(0);
  });

  it('removes another admin after confirmation (DELETE), message only after the answer', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url === `/api/v1/admin/admins/${OTHER_ID}` && init?.method === 'DELETE')
        return Promise.resolve(ok({ user_id: OTHER_ID, removed: true }));
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    const row = await rowFor('ma***@exemplo.com.br');
    await user.click(within(row).getByRole('button', { name: /Remover/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/perderá o acesso/);
    expect(callsTo(fetchMock, '/api/v1/admin/admins/')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Remover e registrar' }));
    expect(
      await screen.findByText(/Acesso de ma\*\*\*@exemplo\.com\.br removido/),
    ).toBeInTheDocument();
    expect(callsTo(fetchMock, `/api/v1/admin/admins/${OTHER_ID}`)[0]?.[1].method).toBe('DELETE');
  });

  it('last admin (409) keeps the dialog message and shows the conflict text', async () => {
    stubFetch((url, init) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url.startsWith('/api/v1/admin/admins/') && init?.method === 'DELETE')
        return Promise.resolve(apiError('CONFLICT', 409, 'x'));
      if (url === '/api/v1/admin/admins') return Promise.resolve(ok(list));
      return undefined;
    });
    const user = userEvent.setup();
    renderAdmin();
    await openAdminsTab(user);
    const row = await rowFor('ma***@exemplo.com.br');
    await user.click(within(row).getByRole('button', { name: /Remover/ }));
    await user.click(await screen.findByRole('button', { name: 'Remover e registrar' }));
    const alerts = await screen.findAllByText(
      'Este é o último administrador e não pode ser removido.',
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(screen.queryByText(/removido\. A ação foi registrada/)).not.toBeInTheDocument();
  });
});
