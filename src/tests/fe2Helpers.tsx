/**
 * Test doubles for FE-2 pages: fake Supabase Auth client, Turnstile stub and a
 * multi-route memory router. No network: every fetch is stubbed per test.
 */
import { render } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { vi } from 'vitest';
import { Providers } from '@/app/providers';
import { createQueryClient } from '@/app/queryClient';

export const USER_ID = '22222222-2222-4222-8222-222222222222';

export function makeSession(opts: { anonymous?: boolean; email?: string | null } = {}): Session {
  const anonymous = opts.anonymous ?? true;
  return {
    access_token: `test-access-token-${anonymous ? 'anon' : 'verified'}-0123456789`,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
      is_anonymous: anonymous,
      email: opts.email ?? undefined,
    },
  } as Session;
}

type Listener = (event: string, session: Session | null) => void;

export function createFakeSupabase(initial: Session | null = null) {
  let session = initial;
  const listeners = new Set<Listener>();
  const notify = (event: string) => listeners.forEach((l) => l(event, session));
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
    signInAnonymously: vi.fn(async () => {
      session = makeSession({ anonymous: true });
      notify('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    }),
    refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
    setSession: vi.fn(async () => {
      session = makeSession({ anonymous: true, email: 'pessoa@exemplo.com.br' });
      notify('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    }),
    verifyOtp: vi.fn(async () => {
      session = makeSession({ anonymous: true, email: 'pessoa@exemplo.com.br' });
      return { data: { session, user: session.user }, error: null };
    }),
    exchangeCodeForSession: vi.fn(async () => ({
      data: { session: null, user: null },
      error: { message: 'invalid', code: 'bad_code_verifier', status: 400 },
    })),
    signOut: vi.fn(async () => {
      session = null;
      notify('SIGNED_OUT');
      return { error: null };
    }),
  };
  return {
    auth,
    setSession(s: Session | null) {
      session = s;
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** Installs a fake `window.turnstile`. `autoPass` solves the challenge on render/reset. */
export function installTurnstile({ autoPass = true }: { autoPass?: boolean } = {}) {
  let n = 0;
  let cb: ((t: string) => void) | undefined;
  const solve = () => setTimeout(() => cb?.(`turnstile-token-${++n}`), 0);
  const api = {
    render: vi.fn((_el: HTMLElement, opts: { callback?: (t: string) => void }) => {
      cb = opts.callback;
      if (autoPass) solve();
      return 'widget-1';
    }),
    reset: vi.fn(() => {
      if (autoPass) solve();
    }),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return api;
}

export function uninstallTurnstile() {
  delete window.turnstile;
}

function LocationProbe() {
  const loc = useLocation();
  return (
    <p data-testid="location">
      {loc.pathname}
      {loc.search}
    </p>
  );
}

/** Renders `element` at `path` plus probe routes so navigations can be asserted. */
export function renderRoutes(routes: { path: string; element: ReactElement }[], initial: string) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } });
  const router = createMemoryRouter([...routes, { path: '*', element: <LocationProbe /> }], {
    initialEntries: [initial],
  });
  return {
    client,
    router,
    ...render(
      <Providers client={client}>
        <RouterProvider router={router} />
      </Providers>,
    ),
  };
}

export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, meta: { request_id: 'req-test' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function apiError(
  code: string,
  status: number,
  message = 'erro',
  fields?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, fields }, meta: { request_id: 'req-err' } }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

/** Finds the fetch call for a path (ignores snapshot/static requests). */
export function callsTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.filter(([u]) => String(u).startsWith(path)) as unknown as [
    string,
    RequestInit,
  ][];
}

export function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const h = init?.headers as Record<string, string> | undefined;
  return h?.[name];
}

/** First fetch call for a path; fails the test if there was none. */
export function firstCallTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  const call = callsTo(fetchMock, path)[0];
  if (!call) throw new Error(`no fetch call to ${path}`);
  return call;
}
