import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParticiparPage from '@/pages/ParticiparPage';
import { stubFetch } from './utils';
import {
  apiError,
  callsTo,
  clerk,
  clerkApiError,
  CLERK_TOKEN,
  firstCallTo,
  headerOf,
  installTurnstile,
  ok,
  PROFILE_ID,
  renderRoutes,
  uninstallTurnstile,
  USER_ID,
} from './fe2Helpers';

const TERRITORY = 'mg-3106200-centro';

function renderPage() {
  return renderRoutes(
    [{ path: '/participar', element: <ParticiparPage /> }],
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

function registrationOk() {
  return ok(
    {
      profile_id: PROFILE_ID,
      territory_id: TERRITORY,
      email_verification_state: 'verified',
      session_state: 'verified',
    },
    201,
  );
}

/** Fills the form, submits step 1 and waits for the code step. */
async function reachCodeStep(user: User, ts: { render: ReturnType<typeof vi.fn> }) {
  await fillValid(user);
  await waitFor(() => expect(ts.render).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
  return screen.findByLabelText(/^Código de verificação/);
}

/** Signed-in person without a profile yet: completes only the missing fields. */
async function fillSignedIn(user: User, ts: { render: ReturnType<typeof vi.fn> }) {
  await user.type(await screen.findByLabelText(/^WhatsApp/), '(31) 99999-8888');
  await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
  await waitFor(() => expect(ts.render).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Concluir cadastro' }));
}

const noProfile = () => Promise.resolve(apiError('NOT_FOUND', 404, 'Sem perfil.'));

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

describe('/participar — RegistrationForm (Clerk, ADR 0005)', () => {
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
    expect(clerk.fns.signUpCreate).not.toHaveBeenCalled();
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
    expect(screen.getByRole('link', { name: 'Entrar com código' })).toHaveAttribute(
      'href',
      '/entrar',
    );
  });

  it('T04: without a Turnstile token the client blocks the submit (no Clerk call)', async () => {
    installTurnstile({ autoPass: false });
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(
      (await screen.findAllByText('Conclua a verificação de segurança antes de enviar.')).length,
    ).toBeGreaterThan(0);
    expect(clerk.fns.signUpCreate).not.toHaveBeenCalled();
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

  it('T05: sign-up → code by e-mail → session → POST /registrations (Bearer Clerk) → /obrigado', async () => {
    const ts = installTurnstile();
    const fetchMock = stubFetch((url, init) =>
      url === '/api/v1/registrations' && init?.method === 'POST'
        ? Promise.resolve(registrationOk())
        : undefined,
    );
    const user = userEvent.setup();
    renderPage();
    const codeInput = await reachCodeStep(user, ts);

    expect(clerk.fns.signUpCreate).toHaveBeenCalledWith({
      emailAddress: 'maria@exemplo.com.br',
      firstName: 'Maria Silva',
    });
    expect(clerk.fns.prepareEmailAddressVerification).toHaveBeenCalledWith({
      strategy: 'email_code',
    });
    expect(screen.getByText('maria@exemplo.com.br')).toBeInTheDocument();
    expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code');
    expect(codeInput).toHaveAttribute('inputmode', 'numeric');
    await waitFor(() => expect(codeInput).toHaveFocus());
    // Nothing reaches the API before the code is confirmed.
    expect(callsTo(fetchMock, '/api/v1/registrations')).toHaveLength(0);

    await user.type(codeInput, '424 242');
    await user.click(screen.getByRole('button', { name: 'Confirmar e cadastrar' }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/obrigado?territorio=${TERRITORY}`,
    );
    expect(clerk.fns.attemptEmailAddressVerification).toHaveBeenCalledWith({ code: '424242' });
    expect(clerk.fns.setActive).toHaveBeenCalledWith({ session: 'sess_test_1' });
    const [, init] = firstCallTo(fetchMock, '/api/v1/registrations');
    expect(headerOf(init, 'Authorization')).toBe(`Bearer ${CLERK_TOKEN}`);
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

  it('instance without first name: retries sign-up with the e-mail only', async () => {
    clerk.fns.signUpCreate.mockRejectedValueOnce(clerkApiError('form_param_unknown', 'first_name'));
    const ts = installTurnstile();
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await reachCodeStep(user, ts);
    expect(clerk.fns.signUpCreate).toHaveBeenLastCalledWith({
      emailAddress: 'maria@exemplo.com.br',
    });
  });

  it('wrong code shows a PT-BR error on the field; no session, no API call', async () => {
    const ts = installTurnstile();
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderPage();
    const codeInput = await reachCodeStep(user, ts);
    await user.type(codeInput, '111111');
    await user.click(screen.getByRole('button', { name: 'Confirmar e cadastrar' }));
    expect(
      await screen.findByText('Código incorreto. Confira os 6 números e tente de novo.'),
    ).toBeInTheDocument();
    expect(codeInput).toHaveAttribute('aria-invalid', 'true');
    expect(clerk.fns.setActive).not.toHaveBeenCalled();
    expect(callsTo(fetchMock, '/api/v1/registrations')).toHaveLength(0);

    // Expired code has its own message.
    clerk.fns.attemptEmailAddressVerification.mockRejectedValueOnce(
      clerkApiError('verification_expired'),
    );
    await user.clear(codeInput);
    await user.type(codeInput, '424242');
    await user.click(screen.getByRole('button', { name: 'Confirmar e cadastrar' }));
    expect(await screen.findByText(/Este código expirou/)).toBeInTheDocument();

    // Incomplete code is caught before calling Clerk.
    clerk.fns.attemptEmailAddressVerification.mockClear();
    await user.clear(codeInput);
    await user.type(codeInput, '12');
    await user.click(screen.getByRole('button', { name: 'Confirmar e cadastrar' }));
    expect(await screen.findByText('Digite os 6 números do código.')).toBeInTheDocument();
    expect(clerk.fns.attemptEmailAddressVerification).not.toHaveBeenCalled();
  });

  it('"Trocar e-mail" goes back to the filled form; "Reenviar código" starts on cooldown', async () => {
    const ts = installTurnstile();
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await reachCodeStep(user, ts);
    expect(screen.getByRole('button', { name: /Reenviar código \(\d+s\)/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Trocar e-mail' }));
    const email = await screen.findByLabelText(/^E-mail/);
    expect(email).toHaveValue('maria@exemplo.com.br');
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Maria Silva');
    await waitFor(() => expect(email).toHaveFocus());
  });

  it('e-mail already registered → "Entrar com código" keeps the form filled and registers', async () => {
    clerk.existing.add('maria@exemplo.com.br');
    const ts = installTurnstile();
    const fetchMock = stubFetch((url, init) =>
      url === '/api/v1/registrations' && init?.method === 'POST'
        ? Promise.resolve(registrationOk())
        : undefined,
    );
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/Este e-mail já tem cadastro/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^WhatsApp/)).toHaveValue('(31) 99999-8888');
    await user.click(screen.getByRole('button', { name: 'Entrar com código' }));

    const codeInput = await screen.findByLabelText(/^Código de verificação/);
    expect(screen.getByRole('heading', { name: 'Entrar com código' })).toBeInTheDocument();
    expect(clerk.fns.signInCreate).toHaveBeenCalledWith({ identifier: 'maria@exemplo.com.br' });
    expect(clerk.fns.prepareFirstFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      emailAddressId: 'idn_test_1',
    });
    await user.type(codeInput, '424242');
    await user.click(screen.getByRole('button', { name: 'Confirmar e cadastrar' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/obrigado');
    expect(clerk.fns.attemptFirstFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      code: '424242',
    });
    const [, init] = firstCallTo(fetchMock, '/api/v1/registrations');
    expect(headerOf(init, 'Authorization')).toBe(`Bearer ${CLERK_TOKEN}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ phone: '+5531999998888' });
  });

  it('with an existing Clerk session: no account creation, e-mail from the account, only POST', async () => {
    clerk.signIn({ email: 'ja@exemplo.com.br', firstName: 'Joana' });
    const ts = installTurnstile();
    const fetchMock = stubFetch((url, init) => {
      if (url === '/api/v1/me') return noProfile();
      if (url === '/api/v1/registrations' && init?.method === 'POST')
        return Promise.resolve(registrationOk());
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    const email = await screen.findByLabelText(/^E-mail/);
    expect(email).toHaveValue('ja@exemplo.com.br');
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Joana');
    await fillSignedIn(user, ts);
    expect(await screen.findByTestId('location')).toHaveTextContent('/obrigado');
    expect(clerk.fns.signUpCreate).not.toHaveBeenCalled();
    const [, init] = firstCallTo(fetchMock, '/api/v1/registrations');
    expect(headerOf(init, 'Authorization')).toBe(`Bearer ${CLERK_TOKEN}`);
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: 'ja@exemplo.com.br',
      display_name: 'Joana',
    });
  });

  it('already registered (GET /me with territory and phone): no form, link to the group', async () => {
    clerk.signIn();
    stubFetch((url) =>
      url === '/api/v1/me'
        ? Promise.resolve(
            ok({
              user_id: USER_ID,
              display_name: 'Maria',
              email_masked: 'ma***@exemplo.com.br',
              email_verified: true,
              is_anonymous: false,
              selected_territory_id: TERRITORY,
              is_admin: false,
              account_state: 'active',
              phone_masked: '+55 (31) 9****-**88',
              profile_review_required: false,
            }),
          )
        : undefined,
    );
    renderPage();
    expect(await screen.findByText(/Você já tem cadastro/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Cadastro' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver grupo da sua região' })).toHaveAttribute(
      'href',
      `/obrigado?territorio=${TERRITORY}`,
    );
  });

  it('T18: API failure after the code never shows success and resets Turnstile', async () => {
    const ts = installTurnstile();
    stubFetch((url) => {
      if (url === '/api/v1/me') return noProfile();
      return url === '/api/v1/registrations'
        ? Promise.resolve(apiError('INTERNAL_ERROR', 500, 'Erro inesperado. Tente novamente.'))
        : undefined;
    });
    const user = userEvent.setup();
    renderPage();
    const codeInput = await reachCodeStep(user, ts);
    await user.type(codeInput, '424242');
    await user.click(screen.getByRole('button', { name: 'Confirmar e cadastrar' }));
    expect(await screen.findByText(/Nada foi confirmado/)).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cadastro recebido/)).not.toBeInTheDocument();
    expect(ts.reset).toHaveBeenCalled();
    // The session now exists: the retry only re-sends POST /registrations.
    expect(await screen.findByRole('button', { name: 'Concluir cadastro' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^WhatsApp/)).toHaveValue('(31) 99999-8888');
  });

  it('server field errors are shown on the field', async () => {
    clerk.signIn();
    const ts = installTurnstile();
    stubFetch((url) => {
      if (url === '/api/v1/me') return noProfile();
      if (url !== '/api/v1/registrations') return undefined;
      return Promise.resolve(
        apiError('VALIDATION_ERROR', 400, 'Revise os dados informados.', {
          territory_id: 'Território inexistente.',
        }),
      );
    });
    const user = userEvent.setup();
    renderPage();
    await fillSignedIn(user, ts);
    expect((await screen.findAllByText('Território inexistente.')).length).toBeGreaterThan(0);
  });

  it('Clerk rate limit on sign-up shows an honest PT-BR message', async () => {
    clerk.fns.signUpCreate.mockRejectedValueOnce(clerkApiError('too_many_requests'));
    const ts = installTurnstile();
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await fillValid(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText(/Aguarde alguns minutos/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Código de verificação/)).not.toBeInTheDocument();
  });

  it('429 from the API shows an honest rate-limit message', async () => {
    clerk.signIn();
    const ts = installTurnstile();
    stubFetch((url) => {
      if (url === '/api/v1/me') return noProfile();
      return url === '/api/v1/registrations'
        ? Promise.resolve(apiError('RATE_LIMITED', 429, 'Muitas tentativas.'))
        : undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await fillSignedIn(user, ts);
    expect(await screen.findByText(/Aguarde alguns minutos/)).toBeInTheDocument();
  });
});
