import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClientError, apiRequest, buildApiUrl } from './api';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  const Schema = z.object({ ok: z.boolean() });

  it('unwraps the success envelope and sends credentials', async () => {
    const f = vi.fn(async () => json({ data: { ok: true }, meta: { request_id: 'r' } }));
    vi.stubGlobal('fetch', f);
    await expect(apiRequest('/health', Schema)).resolves.toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/health');
    expect(init.credentials).toBe('include');
  });

  it('throws a typed error with code, fields and request_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            error: { code: 'VALIDATION_ERROR', message: 'Revise.', fields: { email: 'inválido' } },
            meta: { request_id: 'abc' },
          },
          400,
        ),
      ),
    );
    const err = await apiRequest('/x', Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    const e = err as ApiClientError;
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.fields).toEqual({ email: 'inválido' });
    expect(e.requestId).toBe('abc');
    expect(e.isUnavailable).toBe(false);
  });

  it('maps network failures and non-JSON bodies to unavailable errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const net = (await apiRequest('/x', Schema).catch((e: unknown) => e)) as ApiClientError;
    expect(net.code).toBe('NETWORK_ERROR');
    expect(net.isUnavailable).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    );
    const proxy = (await apiRequest('/x', Schema).catch((e: unknown) => e)) as ApiClientError;
    expect(proxy.code).toBe('HTTP_ERROR');
    expect(proxy.isUnavailable).toBe(true);
  });

  it('rejects payloads that do not match the contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ data: { ok: 'yes' }, meta: { request_id: 'r' } })),
    );
    const e = (await apiRequest('/x', Schema).catch((x: unknown) => x)) as ApiClientError;
    expect(e.code).toBe('INVALID_RESPONSE');
  });

  it('builds query strings skipping empty values', () => {
    expect(
      buildApiUrl('/activities', { territory_id: 'mg-3100104', bbox: undefined, limit: 10, q: '' }),
    ).toBe('/api/v1/activities?territory_id=mg-3100104&limit=10');
  });
});
