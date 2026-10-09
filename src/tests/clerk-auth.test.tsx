/** FE-11 (ADR 0005): /entrar by e-mail code, header session menu, redirects and helpers. */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionMenu } from '@/components/layouts/SessionMenu';
import { routes } from '@/app/router';
import { safeRedirectPath, signInHref } from '@/lib/auth';
import { clerkErrorMessage, isClerkConfigured } from '@/lib/clerk';
import EntrarPage from '@/pages/EntrarPage';
import { stubFetch } from './utils';
import {
  apiError,
  clerk,
  clerkApiError,
  CLERK_TOKEN,
  firstCallTo,
  headerOf,
  ok,
  renderRoutes,
  USER_ID,
} from './fe2Helpers';

afterEach(() => vi.unstubAllGlobals());

function me(isAdmin: boolean) {
  return {
    user_id: USER_ID,
    display_name: 'Maria Silva',
    email_masked: 'ma***@exemplo.com.br',
    email_verified: true,
    is_anonymous: false,
    selected_territory_id: null,
    is_admin: isAdmin,
    account_state: 'active',
    phone_masked: null,
    profile_review_required: false,
  };
}

function renderEntrar(path = '/entrar?next=/criar-atividade') {
  return renderRoutes([{ path: '/entrar', element: <EntrarPage /> }], path);
}

describe('/entrar — sign-in by e-mail code', () => {
  it('e-mail → code → session → redirects to the validated ?next', async () => {
    clerk.existing.add('maria@exemplo.com.br');
    stubFetch();
    const user = userEvent.setup();
    renderEntrar();
    const email = await screen.findByLabelText(/^E-mail/);
    expect(email).toHaveAttribute('autocomplete', 'email');
    await user.type(email, 'Maria@Exemplo.com.br ');
    await user.click(screen.getByRole('button', { name: 'Receber código' }));

    const code = await screen.findByLabelText(/^Código de verificação/);
    expect(clerk.fns.signInCreate).toHaveBeenCalledWith({ identifier: 'maria@exemplo.com.br' });
    expect(screen.getByText('maria@exemplo.com.br')).toBeInTheDocument();
    await waitFor(() => expect(code).toHaveFocus());
    await user.type(code, '424242');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/criar-atividade');
    expect(clerk.fns.setActive).toHaveBeenCalledWith({ session: 'sess_test_2' });
  });

  it('unknown e-mail: PT-BR message with a link to sign up', async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEntrar();
    await user.type(await screen.findByLabelText(/^E-mail/), 'nova@exemplo.com.br');
    await user.click(screen.getByRole('button', { name: 'Receber código' }));
    expect(await screen.findByText(/Não encontramos cadastro com este e-mail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fazer cadastro' })).toHaveAttribute(
      'href',
      '/participar',
    );
  });

  it('wrong code keeps the step with an error; resend calls prepareFirstFactor again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      clerk.existing.add('maria@exemplo.com.br');
      stubFetch();
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      renderEntrar('/entrar');
      await user.type(await screen.findByLabelText(/^E-mail/), 'maria@exemplo.com.br');
      await user.click(screen.getByRole('button', { name: 'Receber código' }));
      const code = await screen.findByLabelText(/^Código de verificação/);
      await user.type(code, '000000');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(await screen.findByText(/Código incorreto/)).toBeInTheDocument();
      expect(clerk.fns.setActive).not.toHaveBeenCalled();

      // Resend starts on a 30 s cooldown (ticks once per second).
      expect(screen.getByRole('button', { name: /Reenviar código \(\d+s\)/ })).toBeDisabled();
      for (let s = 0; s < 31; s++) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
      }
      await user.click(screen.getByRole('button', { name: 'Reenviar código' }));
      expect(await screen.findByText(/Enviamos um novo código/)).toBeInTheDocument();
      expect(clerk.fns.prepareFirstFactor).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('open redirect attempts fall back to /', async () => {
    clerk.existing.add('maria@exemplo.com.br');
    stubFetch();
    const user = userEvent.setup();
    renderEntrar('/entrar?next=https://evil.example/');
    await user.type(await screen.findByLabelText(/^E-mail/), 'maria@exemplo.com.br');
    await user.click(screen.getByRole('button', { name: 'Receber código' }));
    await user.type(await screen.findByLabelText(/^Código de verificação/), '424242');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    // "/" is not a probe route here: the router renders the probe for any unknown path.
    await waitFor(() => expect(clerk.user).not.toBeNull());
    expect(screen.queryByText(/evil/)).not.toBeInTheDocument();
  });

  it('already signed in: says so and offers to continue', async () => {
    clerk.signIn({ email: 'maria@exemplo.com.br' });
    stubFetch();
    renderEntrar();
    expect(await screen.findByText(/Você já entrou como maria@exemplo.com.br/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      '/criar-atividade',
    );
  });
});

describe('header session menu', () => {
  function renderHeader() {
    return renderRoutes([{ path: '/metodologia', element: <SessionMenu /> }], '/metodologia');
  }

  it('signed out: "Entrar" and "Participar", no API call', async () => {
    const fetchMock = stubFetch();
    renderHeader();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
    expect(screen.getByRole('link', { name: 'Participar' })).toHaveAttribute('href', '/participar');
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/'))).toHaveLength(0);
  });

  it('signed in (admin): name, "Minhas atividades", "Moderação" and "Sair" signs out', async () => {
    clerk.signIn({ firstName: 'Maria' });
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(ok(me(true))) : undefined,
    );
    const user = userEvent.setup();
    renderHeader();
    const button = await screen.findByRole('button', { name: 'Maria Silva' });
    const [, init] = firstCallTo(fetchMock, '/api/v1/me');
    expect(headerOf(init, 'Authorization')).toBe(`Bearer ${CLERK_TOKEN}`);
    await user.click(button);
    expect(screen.getByRole('menuitem', { name: 'Minhas atividades' })).toHaveAttribute(
      'href',
      '/minhas-atividades',
    );
    expect(screen.getByRole('menuitem', { name: 'Moderação' })).toHaveAttribute('href', '/admin');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(button);
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }));
    expect(clerk.fns.signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
    expect(await screen.findByRole('link', { name: 'Participar' })).toBeInTheDocument();
  });

  it('signed in (not admin, /me failing): no "Moderação", falls back to the Clerk name', async () => {
    clerk.signIn({ firstName: 'Joana' });
    stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(apiError('NOT_FOUND', 404, 'x')) : undefined,
    );
    const user = userEvent.setup();
    renderHeader();
    await user.click(await screen.findByRole('button', { name: 'Joana' }));
    expect(screen.queryByRole('menuitem', { name: 'Moderação' })).not.toBeInTheDocument();
  });
});

describe('helpers and routes', () => {
  it('Clerk is configured in tests (stubbed publishable key)', () => {
    expect(isClerkConfigured()).toBe(true);
  });

  it.each([
    ['/', '/'],
    ['/criar-atividade', '/criar-atividade'],
    ['/minhas-atividades', '/minhas-atividades'],
    ['/territorio/mg-3106200', '/territorio/mg-3106200'],
    ['/territorio/mg-3106200-centro', '/territorio/mg-3106200-centro'],
    ['//evil.com', '/'],
    ['https://evil.com/criar-atividade', '/'],
    ['/\\evil.com', '/'],
    ['/%2F%2Fevil.com', '/'],
    ['/admin', '/admin'],
    ['/conta/seguranca', '/'],
    ['/admin/x', '/'],
    ['/criar-atividade?x=https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/territorio/../admin', '/'],
  ])('safeRedirectPath(%s) → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it('signInHref only carries safe paths', () => {
    expect(signInHref('/admin')).toBe('/entrar?next=%2Fadmin');
    expect(signInHref('https://evil.com')).toBe('/entrar');
    expect(signInHref()).toBe('/entrar');
  });

  it('Clerk errors map to PT-BR (never Clerk English text)', () => {
    expect(clerkErrorMessage(clerkApiError('form_identifier_exists'))).toMatch(/já tem cadastro/);
    expect(clerkErrorMessage(clerkApiError('form_code_incorrect'))).toMatch(/Código incorreto/);
    expect(clerkErrorMessage(clerkApiError('verification_expired'))).toMatch(/expirou/);
    expect(clerkErrorMessage(new Error('Network down'))).toMatch(/serviço de login/);
  });

  it('removed routes: /entrar exists; legacy auth pages redirect', () => {
    const children = routes[0]!.children!;
    expect(children.some((r) => r.path === 'entrar')).toBe(true);
    expect(children.find((r) => r.path === 'autenticacao/retorno')?.loader).toBeTypeOf('function');
    expect(children.find((r) => r.path === 'conta/seguranca')?.loader).toBeTypeOf('function');
  });
});
