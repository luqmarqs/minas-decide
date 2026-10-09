import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParticiparPage from '@/pages/ParticiparPage';
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

const TERRITORY = 'mg-3106200-centro';
const fake = () => sb.current as FakeSupabase;

function renderPage() {
  return renderRoutes(
    [{ path: '/participar', element: <ParticiparPage /> }],
    `/participar?territorio=${TERRITORY}`,
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^Nome/), 'Maria Silva');
  await user.type(screen.getByLabelText(/^E-mail/), 'maria@exemplo.com.br');
  await user.type(screen.getByLabelText(/^WhatsApp/), '(31) 99999-8888');
  await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
}

beforeEach(() => {
  sb.current = createFakeSupabase(null);
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('/participar — RegistrationForm', () => {
  it('T03: invalid fields show errors + summary, focus the first one, nothing is sent', async () => {
    installTurnstile();
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/^Nome/), 'Maria');
    await user.type(screen.getByLabelText(/^E-mail/), 'nao-e-email');
    await user.type(screen.getByLabelText(/^WhatsApp/), '1234');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    const email = screen.getByLabelText(/^E-mail/);
    expect(await screen.findByText('Revise os campos abaixo')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email.getAttribute('aria-describedby')).toContain('reg-email-error');
    expect(screen.getAllByText('Informe um e-mail válido.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WhatsApp brasileiro válido/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/aceitar os termos/).length).toBeGreaterThan(0);
    await waitFor(() => expect(email).toHaveFocus());
    expect(fake().auth.signInAnonymously).not.toHaveBeenCalled();
    expect(callsTo(fetchMock, '/api/v1/registrations')).toHaveLength(0);
  });

  it('phone input uses tel semantics; terms and opt-in are separate and unchecked', async () => {
    installTurnstile();
    stubFetch();
    renderPage();
    const phone = await screen.findByLabelText(/^WhatsApp/);
    expect(phone).toHaveAttribute('inputmode', 'tel');
    expect(phone).toHaveAttribute('autocomplete', 'tel');
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/^Nome/)).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByRole('checkbox', { name: /Li e aceito/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /comunicações/ })).not.toBeChecked();
  });

  it('T04: without a Turnstile token the client blocks the submit', async () => {
    installTurnstile({ autoPass: false });
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(
      (await screen.findAllByText('Conclua a verificação de segurança antes de enviar.')).length,
    ).toBeGreaterThan(0);
    expect(fake().auth.signInAnonymously).not.toHaveBeenCalled();
    expect(callsTo(fetchMock, '/api/v1/registrations')).toHaveLength(0);
  });

  it('shows an honest message with retry when the Turnstile script cannot load', async () => {
    uninstallTurnstile();
    // Script injection never resolves in jsdom: simulate the error event.
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      setTimeout(() => (node as HTMLScriptElement).onerror?.(new Event('error')), 0);
      return node;
    });
    stubFetch();
    renderPage();
    expect(await screen.findByText(/verificação de segurança não carregou/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar carregar de novo' })).toBeInTheDocument();
    append.mockRestore();
  });

  it('T05: success = provisional session → POST /registrations → /obrigado', async () => {
    const ts = installTurnstile();
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/registrations' && init?.method === 'POST') {
        return Promise.resolve(
          ok(
            {
              profile_id: USER_ID,
              territory_id: TERRITORY,
              email_verification_state: 'pending',
              session_state: 'provisional',
            },
            201,
          ),
        );
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/obrigado?territorio=${TERRITORY}`,
    );
    expect(fake().auth.signInAnonymously).toHaveBeenCalledTimes(1);
    const [, init] = firstCallTo(fetchMock, '/api/v1/registrations');
    expect(headerOf(init, 'Authorization')).toMatch(/^Bearer test-access-token-anon/);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      display_name: 'Maria Silva',
      email: 'maria@exemplo.com.br',
      phone: '+5531999998888',
      territory_id: TERRITORY,
      terms_accepted: true,
      contact_opt_in: false,
    });
    expect(String(body.turnstile_token)).toMatch(/^turnstile-token-/);
  });

  it('T18: API failure never shows success and resets Turnstile', async () => {
    const ts = installTurnstile();
    stubFetch((url) =>
      url === '/api/v1/registrations'
        ? Promise.resolve(apiError('INTERNAL_ERROR', 500, 'Erro inesperado. Tente novamente.'))
        : undefined,
    );
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/Nada foi confirmado/)).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cadastro recebido/)).not.toBeInTheDocument();
    expect(ts.reset).toHaveBeenCalled();
  });

  it('server field errors are shown on the field; 409 is neutral with "entrar por e-mail"', async () => {
    const ts = installTurnstile();
    let call = 0;
    stubFetch((url) => {
      if (url !== '/api/v1/registrations') return undefined;
      call += 1;
      return Promise.resolve(
        call === 1
          ? apiError('VALIDATION_ERROR', 400, 'Revise os dados informados.', {
              territory_id: 'Território inexistente.',
            })
          : apiError(
              'CONFLICT',
              409,
              'Não foi possível concluir o cadastro com este e-mail. Se você já tem conta, peça um link de acesso.',
            ),
      );
    });
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect((await screen.findAllByText('Território inexistente.')).length).toBeGreaterThan(0);

    await waitFor(() => expect(ts.reset).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 5));
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/peça um link de acesso/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar por e-mail' })).toHaveAttribute(
      'href',
      '#entrar-por-email',
    );
    expect(screen.getByRole('heading', { name: 'Entrar por e-mail' })).toBeInTheDocument();
  });

  it('429 shows an honest rate-limit message', async () => {
    const ts = installTurnstile();
    stubFetch((url) =>
      url === '/api/v1/registrations'
        ? Promise.resolve(apiError('RATE_LIMITED', 429, 'Muitas tentativas.'))
        : undefined,
    );
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/Aguarde alguns minutos/)).toBeInTheDocument();
  });
});
