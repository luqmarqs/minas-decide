/**
 * FE-12: Clerk is a lazy chunk mounted next to the app. Public pages without a previous
 * session do not request it before idle; session routes and the session hint do; loading
 * it never remounts the page; flows wait for it instead of failing.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { createQueryClient } from '@/app/queryClient';
import { SessionMenu } from '@/components/layouts/SessionMenu';
import { useEmailCodeSignIn } from '@/features/auth/emailCode';
import {
  hasSessionHint,
  requestClerk,
  SESSION_HINT_KEY,
  useClerkRoot,
  useSession,
} from '@/lib/session';
import type * as IdleNs from '@/lib/idle';
import { clerk } from './fe2Helpers';

type IdleModule = typeof IdleNs;

vi.mock('@/lib/idle', async (orig) => {
  const real = await orig<IdleModule>();
  // Idle never comes unless the test fires it.
  return { ...real, whenIdle: vi.fn(() => () => {}) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

function renderApp(ui: React.ReactElement) {
  const client = createQueryClient();
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] });
  return render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

function ClerkMounted() {
  return <p data-testid="clerk-mounted">{useClerkRoot() ? 'sim' : 'não'}</p>;
}

function Status({ lazy }: { lazy?: boolean }) {
  return <p data-testid="status">{useSession({ lazy }).status}</p>;
}

describe('FE-12 — Clerk off the critical path', () => {
  it('public page without a previous session: "Entrar" at once, Clerk not mounted', async () => {
    const { whenIdle } = await import('@/lib/idle');
    renderApp(
      <>
        <SessionMenu />
        <Status lazy />
        <ClerkMounted />
      </>,
    );
    expect(screen.getAllByText('Entrar').length).toBeGreaterThan(0);
    expect(screen.getByTestId('status')).toHaveTextContent('none');
    expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('não');
    // Deferred to idle (mocked: never fires here).
    expect(vi.mocked(whenIdle)).toHaveBeenCalled();
  });

  it('idle mounts Clerk; a signed-out result keeps "none" without a loading flash', async () => {
    const { whenIdle } = await import('@/lib/idle');
    renderApp(
      <>
        <Status lazy />
        <ClerkMounted />
      </>,
    );
    const cb = vi.mocked(whenIdle).mock.calls.at(-1)?.[0];
    expect(cb).toBeTypeOf('function');
    act(() => cb?.());
    await waitFor(() => expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('sim'));
    expect(screen.getByTestId('status')).toHaveTextContent('none');
  });

  it('previous-session hint (flag): loads Clerk right away and shows the session', async () => {
    clerk.signIn(); // sets the hint, as a browser with a Clerk session has
    expect(hasSessionHint()).toBe(true);
    renderApp(
      <>
        <Status lazy />
        <ClerkMounted />
      </>,
    );
    expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('sim');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('active'));
  });

  it('Clerk cookie `__client_uat` > 0 counts as a hint; `0` does not', () => {
    document.cookie = '__client_uat=0; path=/';
    expect(hasSessionHint()).toBe(false);
    document.cookie = '__client_uat=1760000000; path=/';
    expect(hasSessionHint()).toBe(true);
  });

  it('signed-out result clears the hint flag', async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, '1');
    renderApp(<Status />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('none'));
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('pages that need the session: "loading" while Clerk is not loaded', () => {
    clerk.setLoaded(false);
    renderApp(
      <>
        <Status />
        <ClerkMounted />
      </>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('sim');
  });

  it('mounting Clerk later does not remount the page (typed text survives)', async () => {
    function Typing() {
      const [v, setV] = useState('');
      return <input aria-label="Campo" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    const user = userEvent.setup();
    renderApp(
      <>
        <Typing />
        <ClerkMounted />
      </>,
    );
    await user.type(screen.getByLabelText('Campo'), 'abc');
    expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('não');
    act(() => requestClerk());
    await waitFor(() => expect(screen.getByTestId('clerk-mounted')).toHaveTextContent('sim'));
    expect(screen.getByLabelText('Campo')).toHaveValue('abc');
  });

  it('a sign-in started before Clerk loads waits for it (no false success, no error)', async () => {
    clerk.existing.add('maria@exemplo.com.br');
    clerk.setLoaded(false);
    const holder: { flow: ReturnType<typeof useEmailCodeSignIn> | null } = { flow: null };
    function Probe() {
      const flow = useEmailCodeSignIn({ lazy: true });
      useEffect(() => {
        holder.flow = flow;
      });
      return <p data-testid="ready">{flow.ready ? 'sim' : 'não'}</p>;
    }
    renderApp(<Probe />);
    expect(screen.getByTestId('ready')).toHaveTextContent('não');
    let done = false;
    const started = holder.flow!.start('maria@exemplo.com.br').then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(clerk.fns.signInCreate).not.toHaveBeenCalled();
    act(() => clerk.setLoaded(true));
    await started;
    expect(clerk.fns.signInCreate).toHaveBeenCalledWith({ identifier: 'maria@exemplo.com.br' });
    expect(clerk.fns.prepareFirstFactor).toHaveBeenCalled();
    expect(screen.getByTestId('ready')).toHaveTextContent('sim');
  });
});
