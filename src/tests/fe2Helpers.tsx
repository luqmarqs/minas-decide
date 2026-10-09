/* eslint-disable react-refresh/only-export-components -- test helper module, never hot-reloaded */
/**
 * Test doubles for the organizer/registration pages: Clerk fake (see clerkFake.tsx, mocked
 * globally in setup.ts), Turnstile stub and a multi-route memory router. No network:
 * every fetch is stubbed per test.
 */
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { vi } from 'vitest';
import { Providers } from '@/app/providers';
import { createQueryClient } from '@/app/queryClient';
import { CLERK_USER_ID } from './clerkFake';

export { clerk, clerkApiError, CLERK_TOKEN, CLERK_USER_ID } from './clerkFake';

/** Clerk user id (ADR 0005): GET /me `user_id` and POST /registrations `profile_id`. */
export const USER_ID = CLERK_USER_ID;
export const PROFILE_ID = CLERK_USER_ID;

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
