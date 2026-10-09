import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithApp } from '@/tests/utils';
import { RSVPButton } from './RSVPButton';

const ID = '11111111-1111-4111-8111-111111111111';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RSVPButton', () => {
  it('does not show success before the server responds, then announces it', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithApp(<RSVPButton activityId={ID} initialCount={2} />);

    await user.click(screen.getByRole('button', { name: 'Eu vou' }));

    // Request in flight: busy, no success text, nothing announced as done.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/activities/${ID}/rsvp`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(screen.getByRole('button', { name: /Registrando/ })).toBeDisabled();
    expect(screen.queryByText(/Você marcou/)).not.toBeInTheDocument();
    expect(screen.queryByText(/intenção de ir foi registrada/)).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve(
        jsonResponse({
          data: { activity_id: ID, going: true, rsvp_count_approx: 7 },
          meta: { request_id: 'r1' },
        }),
      );
    });

    expect(await screen.findByText(/Você marcou/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('intenção de ir foi registrada');
    expect(screen.getByText(/Cerca de 7 pessoas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desfazer/ })).toBeInTheDocument();
  });

  it('keeps the original state and shows an error when the server rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: { code: 'RATE_LIMITED', message: 'Muitas tentativas.' },
            meta: { request_id: 'req-9' },
          },
          429,
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithApp(<RSVPButton activityId={ID} initialCount={0} />);
    await user.click(screen.getByRole('button', { name: 'Eu vou' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas.');
    expect(screen.queryByText(/Você marcou/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eu vou' })).toBeEnabled();
  });

  it('undoes with DELETE and only reverts after confirmation', async () => {
    window.localStorage.setItem(`mm.rsvp.${ID}`, '1');
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: { activity_id: ID, going: false, rsvp_count_approx: 1 },
        meta: { request_id: 'r2' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithApp(<RSVPButton activityId={ID} initialCount={2} />);
    await user.click(screen.getByRole('button', { name: /Desfazer/ }));
    expect(await screen.findByRole('button', { name: 'Eu vou' })).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });

  it('explains it is an intention, not attendance, and can be disabled', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWithApp(
      <RSVPButton
        activityId={ID}
        initialCount={0}
        disabledReason="Esta atividade foi cancelada."
      />,
    );
    expect(screen.getByText(/não é inscrição nem confirmação de presença/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eu vou' })).toBeDisabled();
    expect(screen.getByText('Esta atividade foi cancelada.')).toBeInTheDocument();
  });
});
