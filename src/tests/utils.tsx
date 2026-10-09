import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { Providers } from '@/app/providers';
import { createQueryClient } from '@/app/queryClient';

/** Render a component inside the app providers and a memory router. */
export function renderWithApp(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } });
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [route] });
  return {
    client,
    ...render(
      <Providers client={client}>
        <RouterProvider router={router} />
      </Providers>,
    ),
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Stub global fetch: snapshot manifest → 404 (forces DEMO fallback), API → network
 * error, unless `api` handles the path.
 */
export function stubFetch(
  api?: (url: string, init?: RequestInit) => Promise<Response> | undefined,
) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const handled = api?.(url, init);
    if (handled) return handled;
    if (url.includes('/manifest.json')) return new Response('not found', { status: 404 });
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
