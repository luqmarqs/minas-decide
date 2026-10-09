import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContaSegurancaPage from '@/pages/ContaSegurancaPage';
import { groupSecret, qrDataUrl } from '@/features/auth/mfa';
import { stubFetch } from './utils';
import {
  createFakeSupabase,
  installTurnstile,
  makeSession,
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

function me(verified: boolean) {
  return {
    user_id: USER_ID,
    display_name: 'Maria',
    email_masked: 'ma***@exemplo.com.br',
    email_verified: verified,
    is_anonymous: !verified,
    selected_territory_id: null,
    is_admin: false,
    account_state: 'active',
    phone_masked: null,
    profile_review_required: false,
  };
}

function renderPage() {
  return renderRoutes(
    [{ path: '/conta/seguranca', element: <ContaSegurancaPage /> }],
    '/conta/seguranca',
  );
}

beforeEach(() => installTurnstile());
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('mfa helpers', () => {
  it('normalises the QR to a data: URL and groups the secret', () => {
    expect(qrDataUrl('data:image/svg+xml;utf-8,<svg/>')).toBe('data:image/svg+xml;utf-8,<svg/>');
    expect(qrDataUrl('<svg/>')).toBe('data:image/svg+xml;utf8,%3Csvg%2F%3E');
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });
});

describe('/conta/seguranca (P-AUTH-1)', () => {
  it('provisional (unverified) account cannot enrol', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: true }));
    stubFetch((url) => (url === '/api/v1/me' ? Promise.resolve(ok(me(false))) : undefined));
    renderPage();
    expect(
      await screen.findByText(/só pode ser ativada em contas com e-mail confirmado/),
    ).toBeInTheDocument();
    expect(fake().auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it('enrols a TOTP: QR + secret in text + otpauth link, then challenge/verify/refresh', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    stubFetch((url) => (url === '/api/v1/me' ? Promise.resolve(ok(me(true))) : undefined));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/desativada/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ativar verificação em duas etapas' }));

    const qr = await screen.findByRole('img', { name: /QR code/ });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByLabelText('Chave secreta')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(screen.getByRole('link', { name: /Abrir no app autenticador/ })).toHaveAttribute(
      'href',
      'otpauth://totp/Minas:pessoa?secret=JBSWY3DPEHPK3PXP',
    );
    expect(fake().auth.mfa.enroll).toHaveBeenCalledWith(
      expect.objectContaining({ factorType: 'totp' }),
    );

    const code = screen.getByLabelText(/Código de 6 números/);
    await user.type(code, '12345');
    await user.click(screen.getByRole('button', { name: 'Verificar e ativar' }));
    expect(await screen.findByText(/Digite os 6 números/)).toBeInTheDocument();
    expect(fake().auth.mfa.verify).not.toHaveBeenCalled();

    await user.type(code, '6');
    await user.click(screen.getByRole('button', { name: 'Verificar e ativar' }));
    expect(await screen.findByText(/Autenticador ativado/)).toBeInTheDocument();
    expect(fake().auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(fake().auth.refreshSession).toHaveBeenCalled();
    expect(await screen.findByText('Autenticador teste')).toBeInTheDocument();
  });

  it('cancelling an enrolment removes the unverified factor', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false }));
    stubFetch((url) => (url === '/api/v1/me' ? Promise.resolve(ok(me(true))) : undefined));
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Ativar verificação em duas etapas' }),
    );
    await screen.findByRole('img', { name: /QR code/ });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(fake().auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' }),
    );
    expect(fake().mfaState.factors).toHaveLength(0);
  });

  it('removing a verified factor asks for confirmation and a code from an aal1 session', async () => {
    sb.current = createFakeSupabase(makeSession({ anonymous: false })).withVerifiedFactor();
    stubFetch((url) => (url === '/api/v1/me' ? Promise.resolve(ok(me(true))) : undefined));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Celular')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Remover autenticador?');
    await user.type(screen.getByLabelText(/Confirme com o código atual/), '123456');
    await user.click(screen.getByRole('button', { name: 'Remover autenticador' }));
    expect(await screen.findByText(/Autenticador removido/)).toBeInTheDocument();
    expect(fake().auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-verified' });
    expect(fake().mfaState.factors).toHaveLength(0);
  });
});
