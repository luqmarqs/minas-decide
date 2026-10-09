import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeRedirectPath } from '@/lib/auth';
import { parseAuthReturn } from '@/features/auth/authReturn';
import AuthRetornoPage from '@/pages/AuthRetornoPage';
import { stubFetch } from './utils';
import {
  apiError,
  callsTo,
  firstCallTo,
  createFakeSupabase,
  headerOf,
  installTurnstile,
  ok,
  renderRoutes,
  uninstallTurnstile,
  USER_ID,
  type FakeSupabase,
} from './fe2Helpers';

const sb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => sb.current,
  isSupabaseConfigured: () => true,
}));
const fake = () => sb.current as FakeSupabase;

const ME_VERIFIED = {
  user_id: USER_ID,
  display_name: 'Maria',
  email_masked: 'pe***@exemplo.com.br',
  email_verified: true,
  is_anonymous: false,
  selected_territory_id: null,
  is_admin: false,
  account_state: 'active',
  requires_session_refresh: true,
};

function visit(urlTail: string) {
  window.history.replaceState(null, '', `/autenticacao/retorno${urlTail}`);
  return renderRoutes(
    [{ path: '/autenticacao/retorno', element: <AuthRetornoPage /> }],
    '/autenticacao/retorno',
  );
}

beforeEach(() => {
  sb.current = createFakeSupabase(null);
  window.sessionStorage.clear();
  installTurnstile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
  window.history.replaceState(null, '', '/');
});

describe('safeRedirectPath (no open redirect)', () => {
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
    ['/admin', '/'],
    ['/criar-atividade?x=https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/territorio/../admin', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe('parseAuthReturn', () => {
  it('reads implicit tokens from the hash and error codes', () => {
    expect(
      parseAuthReturn('http://x/autenticacao/retorno#access_token=a&refresh_token=b&type=magiclink')
        .params,
    ).toEqual({ kind: 'implicit', accessToken: 'a', refreshToken: 'b' });
    expect(parseAuthReturn('http://x/r#error=access_denied&error_code=otp_expired').params).toEqual(
      { kind: 'error', errorCode: 'otp_expired' },
    );
    expect(parseAuthReturn('http://x/r?token_hash=h&type=magiclink').params).toEqual({
      kind: 'token_hash',
      tokenHash: 'h',
      type: 'magiclink',
    });
    expect(parseAuthReturn('http://x/r?token_hash=h&type=recovery').params.kind).toBe('none');
  });
});

describe('/autenticacao/retorno', () => {
  it('implicit link: sets session, scrubs the URL, confirms e-mail, refreshes, safe next', async () => {
    window.sessionStorage.setItem('mm.auth.next', '/criar-atividade');
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/auth/confirm-email' ? Promise.resolve(ok(ME_VERIFIED)) : undefined,
    );
    visit(
      '#access_token=eyJ.fake.token-abcdefghijklmnopqrstuvwxyz&refresh_token=r1&type=magiclink',
    );

    expect(await screen.findByText(/E-mail confirmado/)).toBeInTheDocument();
    // Tokens are gone from the address bar right away.
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('access_token');
    expect(fake().auth.setSession).toHaveBeenCalledWith({
      access_token: 'eyJ.fake.token-abcdefghijklmnopqrstuvwxyz',
      refresh_token: 'r1',
    });
    const [, init] = firstCallTo(fetchMock, '/api/v1/auth/confirm-email');
    expect(init.method).toBe('POST');
    expect(headerOf(init, 'Authorization')).toMatch(/^Bearer /);
    expect(fake().auth.refreshSession).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Continuar para criar a atividade/ })).toHaveAttribute(
      'href',
      '/criar-atividade',
    );
    expect(window.sessionStorage.getItem('mm.auth.next')).toBeNull();
  });

  it('blocks open redirects from storage or ?next=', async () => {
    window.sessionStorage.setItem('mm.auth.next', '//evil.com/phish');
    stubFetch((url) =>
      url === '/api/v1/auth/confirm-email' ? Promise.resolve(ok(ME_VERIFIED)) : undefined,
    );
    visit(
      '?next=https%3A%2F%2Fevil.com#access_token=tok-abcdefghijklmnopqrstuvwxyz&refresh_token=r',
    );
    expect(await screen.findByText(/E-mail confirmado/)).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    for (const l of links) expect(l.getAttribute('href') ?? '').not.toMatch(/evil/);
    expect(screen.getByRole('link', { name: 'Ir para o mapa' })).toHaveAttribute('href', '/');
    expect(window.location.search).toBe('');
  });

  it('expired link → explains and offers a new link (send-link form with Turnstile)', async () => {
    const fetchMock = stubFetch();
    visit('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    expect(await screen.findByText('Este link expirou ou já foi usado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pedir um novo link' })).toBeInTheDocument();
    expect(screen.getByText('Verificação de segurança')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/auth/confirm-email')).toHaveLength(0);
    expect(window.location.hash).toBe('');
  });

  it('confirm-email 403 → "e-mail ainda não confirmado", no success', async () => {
    stubFetch((url) =>
      url === '/api/v1/auth/confirm-email'
        ? Promise.resolve(
            apiError(
              'EMAIL_NOT_VERIFIED',
              403,
              'Abra o link enviado ao seu e-mail neste dispositivo para confirmar.',
            ),
          )
        : undefined,
    );
    visit('#access_token=tok-abcdefghijklmnopqrstuvwxyz&refresh_token=r');
    expect(await screen.findByText('E-mail ainda não confirmado')).toBeInTheDocument();
    expect(screen.queryByText(/E-mail confirmado\./)).not.toBeInTheDocument();
    await waitFor(() => expect(fake().auth.refreshSession).not.toHaveBeenCalled());
  });

  it('page without link params → invalid', async () => {
    stubFetch();
    visit('');
    expect(await screen.findByText('Link inválido')).toBeInTheDocument();
  });
});
