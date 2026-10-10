import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from '@/pages/admin/AdminPage';
import { stubFetch } from './utils';
import {
  apiError,
  callsTo,
  clerk,
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

function days(n: number, key: 'count' | 'pageviews') {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 8) - (n - 1 - i) * 864e5).toISOString().slice(0, 10);
    return key === 'count'
      ? { day: d, count: i === n - 1 ? 5 : 0 }
      : { day: d, pageviews: i === n - 1 ? 12 : 1, visitors: 1 };
  });
}

function metrics(n: number, site: 'ok' | 'unconfigured' | 'unavailable' = 'ok') {
  return {
    days: n,
    internal: {
      profiles: { total: 1234, last_7d: 21, last_30d: 88, by_day: days(n, 'count') },
      activities: {
        by_status: { pending_review: 3, published: 9, suspended: 1 },
        upcoming_published: 4,
      },
      rsvps: { total: 77, last_7d: 6 },
      groups: { active: 12, suspended: 2, pending_proposals: 5 },
      admins: { total: 2 },
      top_territories: [
        { territory_id: 'mg-3140001', name: 'Mariana', registrations: 40 },
        { territory_id: 'mg-3106200', name: 'Belo Horizonte', registrations: 20 },
      ],
    },
    site:
      site === 'ok'
        ? {
            days: n,
            visitors: 4321,
            visits: 5000,
            pageviews: 12000,
            bounces: 2000,
            bounce_rate: 0.4,
            avg_visit_seconds: 100,
            by_day: days(n, 'pageviews'),
            top_pages: [{ label: '/mapa', count: 900 }],
            top_referrers: [{ label: 'google.com', count: 50 }],
            devices: [{ label: 'mobile', count: 70 }],
          }
        : null,
    site_status: site,
  };
}

function route(handler: (days: number) => Response) {
  return stubFetch((url) => {
    if (url === '/api/v1/me') return Promise.resolve(ok(me));
    if (url.startsWith('/api/v1/admin/queue'))
      return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
    if (url.startsWith('/api/v1/admin/metrics')) {
      return Promise.resolve(handler(Number(new URL(url, 'http://x').searchParams.get('days'))));
    }
    return undefined;
  });
}

async function openMetrics(user: ReturnType<typeof userEvent.setup>) {
  renderRoutes([{ path: '/admin/*', element: <AdminPage /> }], '/admin');
  await user.click(await screen.findByRole('tab', { name: 'Métricas' }));
}

beforeEach(() => {
  clerk.signIn({ email: 'admin@exemplo.com.br', firstName: 'Admin' });
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('/admin — Métricas', () => {
  it('renders numbers, charts with aria-label, ranked lists and the Umami source link', async () => {
    const fetchMock = route((n) => ok(metrics(n)));
    const user = userEvent.setup();
    await openMetrics(user);
    await screen.findByRole('heading', { name: 'Cadastros e atividades' });
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('cadastros no total')).toBeInTheDocument();
    expect(screen.getByText('4.321')).toBeInTheDocument(); // visitantes
    expect(screen.getByText('12.000')).toBeInTheDocument(); // page views
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('1 min 40 s')).toBeInTheDocument();

    const reg = screen.getByRole('img', { name: /^Cadastros por dia: 5 cadastros em 30 dias/ });
    expect(reg).toHaveAttribute('aria-label', expect.stringContaining('pico de 5 em 08/10'));
    expect(
      screen.getByRole('img', { name: /^Page views por dia: 41 page views em 30 dias/ }),
    ).toBeInTheDocument();

    const status = screen.getByRole('list', { name: 'Atividades por status' });
    expect(within(status).getByText('Pendentes de revisão')).toBeInTheDocument();
    const terr = screen.getByRole('list', { name: 'Territórios com mais cadastros' });
    expect(within(terr).getByText('Mariana')).toBeInTheDocument();
    expect(within(terr).getByText('40')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Páginas mais vistas' })).toHaveTextContent('/mapa');
    expect(screen.getByRole('list', { name: 'Dispositivos' })).toHaveTextContent('mobile');

    const link = screen.getByRole('link', { name: /Umami · analytics\.luqmarqs\.dev/ });
    expect(link).toHaveAttribute('href', 'https://analytics.luqmarqs.dev/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(callsTo(fetchMock, '/api/v1/admin/metrics')[0]![0]).toContain('days=30');
  });

  it('switching the period refetches with days and marks aria-pressed', async () => {
    const fetchMock = route((n) => ok(metrics(n)));
    const user = userEvent.setup();
    await openMetrics(user);
    await screen.findByRole('heading', { name: 'Cadastros e atividades' });
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() =>
      expect(callsTo(fetchMock, '/api/v1/admin/metrics').map(([u]) => u)).toEqual(
        expect.arrayContaining([expect.stringContaining('days=7')]),
      ),
    );
    expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await screen.findByRole('img', { name: /^Cadastros por dia: 5 cadastros em 7 dias/ });
    await user.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() =>
      expect(callsTo(fetchMock, '/api/v1/admin/metrics').map(([u]) => u)).toEqual(
        expect.arrayContaining([expect.stringContaining('days=90')]),
      ),
    );
  });

  it('unconfigured Umami: short note, internal numbers still shown', async () => {
    route((n) => ok(metrics(n, 'unconfigured')));
    const user = userEvent.setup();
    await openMetrics(user);
    expect(
      await screen.findByText(
        'Audiência ainda não configurada: faltam as credenciais do Umami no servidor.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Page views por dia/ })).not.toBeInTheDocument();
  });

  it('unavailable Umami: retry note', async () => {
    route((n) => ok(metrics(n, 'unavailable')));
    const user = userEvent.setup();
    await openMetrics(user);
    expect(await screen.findByText('Umami indisponível agora; tente de novo.')).toBeInTheDocument();
  });

  it('403 shows the no-permission message', async () => {
    route(() => apiError('FORBIDDEN', 403, 'Sem permissão'));
    const user = userEvent.setup();
    await openMetrics(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Sem permissão\. É preciso estar na lista de administradores/);
  });

  it('shows a loading state before the answer', async () => {
    stubFetch((url) => {
      if (url === '/api/v1/me') return Promise.resolve(ok(me));
      if (url.startsWith('/api/v1/admin/queue'))
        return Promise.resolve(ok({ kind: 'groups', items: [], next_cursor: null }));
      if (url.startsWith('/api/v1/admin/metrics')) return new Promise<Response>(() => undefined);
      return undefined;
    });
    const user = userEvent.setup();
    await openMetrics(user);
    expect(await screen.findByText('Carregando métricas…')).toBeInTheDocument();
  });
});
