import { screen, waitFor, within } from '@testing-library/react';
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

function person(i: number) {
  return {
    user_id: `user_2reg${String(i).padStart(8, '0')}`,
    display_name: `Pessoa ${i}`,
    email: `pessoa${i}@exemplo.com.br`,
    phone: '+5531999990000',
    territory_id: 'mg-3140001',
    territory_name: 'Mariana',
    contact_opt_in: i % 2 === 0,
    consent_version: 'v1',
    email_verification_state: i === 1 ? 'pending' : 'verified',
    account_state: i === 2 ? 'suspended' : 'active',
    created_at: '2026-10-08T15:04:05Z',
  };
}

const page = (from: number, n: number, next: string | null, total: number) =>
  ok({ items: Array.from({ length: n }, (_, k) => person(from + k)), next_cursor: next, total });

interface Opts {
  list?: (params: URLSearchParams) => Response;
  csv?: () => Response;
}

function route({ list, csv }: Opts = {}) {
  return stubFetch((url) => {
    if (url === '/api/v1/me') return Promise.resolve(ok(me));
    if (url.startsWith('/api/v1/admin/queue'))
      return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
    if (url.startsWith('/api/v1/admin/registrations/export.csv'))
      return Promise.resolve(csv ? csv() : apiError('INTERNAL_ERROR', 500));
    if (url.startsWith('/api/v1/admin/registrations'))
      return Promise.resolve(
        list
          ? list(new URL(url, 'http://x').searchParams)
          : ok({ items: [], next_cursor: null, total: 0 }),
      );
    return undefined;
  });
}

async function openTab(user: ReturnType<typeof userEvent.setup>) {
  renderRoutes([{ path: '/admin/*', element: <AdminPage /> }], '/admin');
  await user.click(await screen.findByRole('tab', { name: 'Cadastros' }));
}

beforeEach(() => {
  clerk.signIn({ email: 'admin@exemplo.com.br', firstName: 'Admin' });
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  uninstallTurnstile();
});

describe('/admin — Cadastros', () => {
  it('lists with an accessible table, mobile labels, PII notice and counters', async () => {
    const fetchMock = route({ list: () => page(1, 3, null, 3) });
    const user = userEvent.setup();
    await openTab(user);
    const table = await screen.findByRole('table');
    expect(within(table).getByText(/Cadastros, do mais recente/)).toBeInTheDocument(); // caption
    const heads = within(table).getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent)).toEqual([
      'Nome',
      'E-mail',
      'WhatsApp',
      'Território',
      'Comunicações',
      'Situação',
      'Cadastro',
    ]);
    heads.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
    const row = screen.getByText('Pessoa 1').closest('tr')!;
    expect(within(row).getByText('pessoa1@exemplo.com.br')).toBeInTheDocument();
    expect(within(row).getByText('(31) 99999-0000')).toBeInTheDocument();
    expect(within(row).getByText('Mariana')).toBeInTheDocument();
    expect(within(row).getByText('não')).toBeInTheDocument();
    expect(within(row).getByText('e-mail não verificado')).toBeInTheDocument();
    expect(within(row).getByText('Pessoa 1').closest('td')).toHaveAttribute('data-label', 'Nome');
    expect(screen.getByText('suspensa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Dados pessoais — uso restrito à campanha; acessos ficam registrados na auditoria.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('3 resultados')).toBeInTheDocument();
    expect(screen.getByText('3 de 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    const call = callsTo(fetchMock, '/api/v1/admin/registrations')[0]!;
    expect(call[0]).toContain('limit=50');
  });

  it('loads more with the cursor and keeps the counter', async () => {
    const fetchMock = route({
      list: (p) => (p.get('cursor') === 'c1' ? page(51, 10, null, 60) : page(1, 50, 'c1', 60)),
    });
    const user = userEvent.setup();
    await openTab(user);
    await screen.findByText('Pessoa 50');
    expect(screen.getByText('50 de 60')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await screen.findByText('Pessoa 60');
    expect(screen.getByText('60 de 60')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    const urls = callsTo(fetchMock, '/api/v1/admin/registrations').map(([u]) => u);
    expect(urls.some((u) => u.includes('cursor=c1'))).toBe(true);
  });

  it('search is debounced (300 ms), refetches with q and announces the result count', async () => {
    const fetchMock = route({
      list: (p) => (p.get('q') === 'mariana' ? page(1, 2, null, 2) : page(1, 5, null, 5)),
    });
    const user = userEvent.setup();
    await openTab(user);
    await screen.findByText('5 resultados');
    const input = screen.getByRole('searchbox', { name: /Buscar por nome, e-mail ou território/ });
    await user.type(input, 'mariana');
    // typing alone does not fire one request per key
    await waitFor(() =>
      expect(
        callsTo(fetchMock, '/api/v1/admin/registrations').filter(([u]) => u.includes('q=')),
      ).toHaveLength(1),
    );
    expect(
      callsTo(fetchMock, '/api/v1/admin/registrations').filter(([u]) => u.includes('q=')),
    ).toHaveLength(1);
    expect(
      callsTo(fetchMock, '/api/v1/admin/registrations').find(([u]) => u.includes('q='))![0],
    ).toContain('q=mariana');
    expect(await screen.findByText('2 resultados')).toBeInTheDocument();
  });

  it('shows an empty state for a search without results', async () => {
    route({ list: () => ok({ items: [], next_cursor: null, total: 0 }) });
    const user = userEvent.setup();
    await openTab(user);
    expect(await screen.findByText('Ainda não há cadastros.')).toBeInTheDocument();
  });

  it('403 shows the no-permission message', async () => {
    route({ list: () => apiError('FORBIDDEN', 403, 'x') });
    const user = userEvent.setup();
    await openTab(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Sem permissão\. É preciso estar na lista de administradores/,
    );
  });

  it('download: fetches the CSV with Authorization, creates the blob and clicks a named link', async () => {
    const createUrl = vi.fn(() => 'blob:csv-1');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
    let clicked: { href: string; download: string } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = { href: this.href, download: this.download };
    });
    const fetchMock = route({
      list: () => page(1, 3, null, 3),
      csv: () =>
        new Response('\uFEFFNome;E-mail\r\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="cadastros-minas-decide-2026-10-08.csv"',
          },
        }),
    });
    const user = userEvent.setup();
    await openTab(user);
    await screen.findByText('Pessoa 1');
    expect(screen.queryByText(/Arquivo cadastros/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    expect(
      await screen.findByText(/Arquivo cadastros-minas-decide-2026-10-08\.csv gerado/),
    ).toBeInTheDocument();
    const [url, init] = callsTo(fetchMock, '/api/v1/admin/registrations/export.csv')[0]!;
    expect(url).toBe('/api/v1/admin/registrations/export.csv');
    expect(headerOf(init, 'Authorization')).toMatch(/^Bearer /);
    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob = (createUrl.mock.calls[0] as unknown as [Blob])[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(clicked).toEqual({
      href: 'blob:csv-1',
      download: 'cadastros-minas-decide-2026-10-08.csv',
    });
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:csv-1'));
  });

  it('download error: message by code, no file created, no success text', async () => {
    const createUrl = vi.fn(() => 'blob:never');
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });
    route({
      list: () => page(1, 3, null, 3),
      csv: () => apiError('RATE_LIMITED', 429, 'x'),
    });
    const user = userEvent.setup();
    await openTab(user);
    await screen.findByText('Pessoa 1');
    await user.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Muitos downloads seguidos/);
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByText(/gerado/)).not.toBeInTheDocument();
    // the button is usable again
    expect(screen.getByRole('button', { name: 'Baixar CSV' })).toBeEnabled();
  });
});
