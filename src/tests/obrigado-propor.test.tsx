import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ObrigadoPage from '@/pages/ObrigadoPage';
import ProporGrupoPage from '@/pages/ProporGrupoPage';
import { isWhatsAppInviteUrl } from '@shared/contracts/groups.ts';
import { VIRA_VOTO_GROUP_URL } from '@/lib/campaign';
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

const TERRITORY = 'mg-3106200-centro';
const GROUP = {
  id: '33333333-3333-4333-8333-333333333333',
  display_name: 'Centro BH em Movimento',
  territory_id: TERRITORY,
  join_url: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOp',
  status: 'active',
  updated_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  clerk.signIn({ email: 'maria@exemplo.com.br', firstName: 'Maria' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  uninstallTurnstile();
});

function renderObrigado() {
  return renderRoutes(
    [{ path: '/obrigado', element: <ObrigadoPage /> }],
    `/obrigado?territorio=${TERRITORY}`,
  );
}

describe('/obrigado (D54: grupo único do vira-voto)', () => {
  it('shows the vira-voto invite with noopener/noreferrer and visible domain, no group lookup', async () => {
    const fetchMock = stubFetch();
    renderObrigado();
    expect(
      screen.getByRole('heading', { name: 'Entre no grupo do vira-voto!' }),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Entrar no grupo/ });
    expect(link).toHaveAttribute('href', VIRA_VOTO_GROUP_URL);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(isWhatsAppInviteUrl(VIRA_VOTO_GROUP_URL)).toBe(true);
    expect(screen.getByText('chat.whatsapp.com')).toBeInTheDocument();
    expect(screen.getByText(/não sabe se você entrou/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Propor um grupo/ })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, '/api/v1/groups')).toHaveLength(0);
  });
});

describe('/propor-grupo — GroupProposalForm', () => {
  function renderPropor() {
    return renderRoutes(
      [{ path: '/propor-grupo', element: <ProporGrupoPage /> }],
      `/propor-grupo?territorio=${TERRITORY}`,
    );
  }

  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/^Nome público do grupo/), 'Centro BH');
    await user.type(screen.getByLabelText(/^Link de convite/), GROUP.join_url);
    await user.clear(screen.getByLabelText(/^Seu nome/));
    await user.type(screen.getByLabelText(/^Seu nome/), 'João Souza');
    await user.clear(screen.getByLabelText(/^Seu e-mail/));
    await user.type(screen.getByLabelText(/^Seu e-mail/), 'joao@exemplo.com.br');
    await user.type(screen.getByLabelText(/^Seu WhatsApp/), '31988887777');
    await user.click(screen.getByRole('checkbox', { name: /Declaro que administro/ }));
  }

  it('T12: proposal ends in "enviada para análise" (no publication promise); same idempotency key on retry', async () => {
    const ts = installTurnstile();
    let n = 0;
    const fetchMock = stubFetch((url) => {
      if (url === '/api/v1/me')
        return Promise.resolve(
          ok({
            user_id: USER_ID,
            display_name: 'Maria Cadastrada',
            email_masked: 'ma***@exemplo.com.br',
            email_verified: true,
            is_anonymous: false,
            selected_territory_id: TERRITORY,
            is_admin: false,
            account_state: 'active',
            phone_masked: null,
            profile_review_required: false,
          }),
        );
      if (url === '/api/v1/groups/proposals') {
        n += 1;
        return Promise.resolve(
          n === 1
            ? new Response('bad gateway', { status: 502 })
            : ok({ id: '44444444-4444-4444-8444-444444444444', status: 'pending' }, 201),
        );
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPropor();
    // Pre-filled from the session profile (still editable).
    await waitFor(() => expect(screen.getByLabelText(/^Seu nome/)).toHaveValue('Maria Cadastrada'));
    await fill(user);
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Enviar proposta/ }));
    expect(await screen.findByText(/Não foi possível falar com o servidor/)).toBeInTheDocument();
    expect(screen.queryByText('Proposta enviada para análise')).not.toBeInTheDocument();

    await waitFor(() => expect(ts.reset).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 5));
    await user.click(screen.getByRole('button', { name: /Enviar proposta/ }));
    expect(await screen.findByText('Proposta enviada para análise')).toBeInTheDocument();
    expect(screen.getByText('só aparece no site se for aprovado')).toBeInTheDocument();

    const posts = callsTo(fetchMock, '/api/v1/groups/proposals');
    expect(posts).toHaveLength(2);
    const [b1, b2] = posts.map(
      ([, init]) => JSON.parse(String(init.body)) as Record<string, string>,
    );
    expect(b1!.idempotency_key).toBeTruthy();
    expect(b2!.idempotency_key).toBe(b1!.idempotency_key);
    expect(b2!.turnstile_token).not.toBe(b1!.turnstile_token);
    expect(b2!.proposer_name).toBe('João Souza');
    expect(headerOf(posts[0]![1], 'Authorization')).toMatch(/^Bearer /);
    // Long interaction test (two submits, many keystrokes): generous timeout under parallel load.
  }, 15_000);

  it('rejects a non-WhatsApp invite link on the client', async () => {
    installTurnstile();
    const fetchMock = stubFetch((url) =>
      url === '/api/v1/me' ? Promise.resolve(apiError('UNAUTHENTICATED', 401)) : undefined,
    );
    const user = userEvent.setup();
    renderPropor();
    await user.type(await screen.findByLabelText(/^Link de convite/), 'https://t.me/grupo');
    await user.click(screen.getByRole('button', { name: /Enviar proposta/ }));
    expect((await screen.findAllByText(/link de convite oficial/)).length).toBeGreaterThan(0);
    expect(callsTo(fetchMock, '/api/v1/groups/proposals')).toHaveLength(0);
  });
});
