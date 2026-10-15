/**
 * D48: volunteer sign-up WITHOUT an account (/participar and the home #participar share
 * RegistrationForm). One step, public POST /registrations, never Clerk.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParticiparPage from '@/pages/ParticiparPage';
import { useClerkRoot } from '@/lib/session';
import type * as IdleNs from '@/lib/idle';
import { stubFetch } from './utils';
import {
  apiError,
  callsTo,
  clerk,
  firstCallTo,
  headerOf,
  installTurnstile,
  ok,
  renderRoutes,
  uninstallTurnstile,
} from './fe2Helpers';

vi.mock('@/lib/idle', async (orig) => {
  const real = await orig<typeof IdleNs>();
  // Idle never comes: anything that mounts Clerk here was requested by the page itself.
  return { ...real, whenIdle: vi.fn(() => () => {}) };
});

const TERRITORY = 'mg-3106200-centro';
const URL_ = '/api/v1/registrations';

function ClerkMounted() {
  return <p data-testid="clerk-mounted">{useClerkRoot() ? 'sim' : 'não'}</p>;
}

function renderPage() {
  return renderRoutes(
    [
      {
        path: '/participar',
        element: (
          <>
            <ParticiparPage />
            <ClerkMounted />
          </>
        ),
      },
    ],
    `/participar?territorio=${TERRITORY}`,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function fillValid(user: User) {
  await user.type(await screen.findByLabelText(/^Nome/), 'Maria Silva');
  await user.type(screen.getByLabelText(/^E-mail/), 'maria@exemplo.com.br');
  await user.type(screen.getByLabelText(/^WhatsApp/), '(31) 99999-8888');
  await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
}

const received = () => ok({ territory_id: TERRITORY, status: 'received' });

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('/participar — volunteer sign-up without an account (D48)', () => {
  it('one step: POST /registrations without Authorization → /obrigado; Clerk never requested', async () => {
    const ts = installTurnstile();
    const fetchMock = stubFetch((url, init) =>
      url === URL_ && init?.method === 'POST' ? Promise.resolve(received()) : undefined,
    );
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/obrigado?territorio=${TERRITORY}`,
    );
    const [, init] = firstCallTo(fetchMock, URL_);
    expect(headerOf(init, 'Authorization')).toBeFalsy();
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
    expect(callsTo(fetchMock, URL_)).toHaveLength(1);
    expect(callsTo(fetchMock, '/api/v1/me')).toHaveLength(0);
    expect(clerk.fns.signUpCreate).not.toHaveBeenCalled();
    expect(clerk.fns.signInCreate).not.toHaveBeenCalled();
  });

  it('the form itself never mounts Clerk; no code step, no "Entrar com código"', async () => {
    installTurnstile();
    stubFetch();
    renderPage();
    expect(await screen.findByLabelText(/^Nome/)).toBeInTheDocument();
    expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('não');
    expect(screen.queryByText(/código/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Entrar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Não é preciso criar conta nem senha/)).toBeInTheDocument();
  });

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
    expect(callsTo(fetchMock, URL_)).toHaveLength(0);
  });

  it('autocomplete/inputmode semantics; terms and opt-in are separate and unchecked', async () => {
    installTurnstile();
    stubFetch();
    renderPage();
    const phone = await screen.findByLabelText(/^WhatsApp/);
    expect(phone).toHaveAttribute('inputmode', 'tel');
    expect(phone).toHaveAttribute('autocomplete', 'tel');
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/^E-mail/)).not.toHaveAttribute('readonly');
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
    expect(callsTo(fetchMock, URL_)).toHaveLength(0);
  });

  it('T18: API failure never shows success, keeps the form filled and resets Turnstile', async () => {
    const ts = installTurnstile();
    stubFetch((url) =>
      url === URL_
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
    expect(screen.getByLabelText(/^WhatsApp/)).toHaveValue('(31) 99999-8888');
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeEnabled();
  });

  it('server field errors are shown on the field', async () => {
    const ts = installTurnstile();
    stubFetch((url) =>
      url === URL_
        ? Promise.resolve(
            apiError('VALIDATION_ERROR', 400, 'Revise os dados informados.', {
              territory_id: 'Território inexistente.',
            }),
          )
        : undefined,
    );
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect((await screen.findAllByText('Território inexistente.')).length).toBeGreaterThan(0);
  });

  it('Turnstile refused by the server and 429 show honest messages', async () => {
    const ts = installTurnstile();
    let n = 0;
    stubFetch((url) => {
      if (url !== URL_) return undefined;
      n += 1;
      return Promise.resolve(
        n === 1
          ? apiError('TURNSTILE_FAILED', 400, 'Verificação falhou.')
          : apiError('RATE_LIMITED', 429, 'Muitas tentativas.'),
      );
    });
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/verificação de segurança não foi aceita/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/Aguarde alguns minutos/)).toBeInTheDocument();
  });
});
