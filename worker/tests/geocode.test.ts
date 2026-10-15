/**
 * D53: address search proxy. fetch is ALWAYS mocked: Google and Photon are never called for real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeocodePlaceResponse,
  GeocodeResolveResponse,
  GeocodeSearchResponse,
} from '../../shared/contracts/geocode.ts';
import { body, setup } from './fakes.ts';

const KEY = 'google-test-key-placeholder';

const photonFeature = (over: Record<string, unknown> = {}, coords = [-43.9386, -19.9191]) => ({
  geometry: { coordinates: coords },
  properties: {
    osm_type: 'N',
    osm_id: 1,
    name: 'Praça da Liberdade',
    street: 'Avenida Bias Fortes',
    housenumber: '10',
    suburb: 'Funcionários',
    city: 'Belo Horizonte',
    state: 'Minas Gerais',
    countrycode: 'BR',
    ...over,
  },
});

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

function stub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GET /geocode (Photon fallback, no key)', () => {
  it('normalizes features, limits to the MG bbox and filters other states', async () => {
    const fetchMock = stub(() =>
      json({
        features: [
          photonFeature(),
          photonFeature({ osm_id: 2, state: 'São Paulo', name: 'Fora' }, [-46.6, -23.5]),
          photonFeature({ osm_id: 3, name: 'Bbox' }, [-40.0, -30.0]),
        ],
      }),
    );
    const { request } = setup();
    const res = await request('/api/v1/geocode?q=praca%20liberdade');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120');
    const data = GeocodeSearchResponse.parse((await body(res)).data);
    expect(data.provider).toBe('photon');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.place).toMatchObject({
      street: 'Avenida Bias Fortes',
      number: '10',
      neighborhood: 'Funcionários',
      city: 'Belo Horizonte',
      coordinates: [-43.9386, -19.9191],
    });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin).toBe('https://photon.komoot.io');
    expect(url.searchParams.get('limit')).toBe('6');
    expect(url.searchParams.get('bbox')).toBe('-51.05,-22.95,-39.85,-14.2');
  });

  it('rejects short queries without calling upstream', async () => {
    const fetchMock = stub(() => json({ features: [] }));
    const { request } = setup();
    const res = await request('/api/v1/geocode?q=ab');
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upstream failure -> generic 503 without internals or the search text', async () => {
    stub(() => new Response('boom stack trace', { status: 500 }));
    const { request } = setup();
    const res = await request('/api/v1/geocode?q=segredo-da-busca');
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const text = await res.text();
    expect(text).toContain('SERVICE_UNAVAILABLE');
    expect(text).not.toMatch(/boom|stack|segredo-da-busca/);
  });

  it('upstream timeout -> generic 503', async () => {
    vi.useFakeTimers();
    stub(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('x', 'AbortError')),
          );
        }) as unknown as Response,
    );
    const { request } = setup();
    const pending = request('/api/v1/geocode?q=timeout%20teste');
    await vi.advanceTimersByTimeAsync(5000);
    const res = await pending;
    expect(res.status).toBe(503);
    expect((await body(res)).error?.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('rate limits per IP (429 with Retry-After) before calling upstream again', async () => {
    const fetchMock = stub(() => json({ features: [] }));
    const { request } = setup();
    for (let i = 0; i < 60; i++) {
      const ok = await request(`/api/v1/geocode?q=rua%20${i}%20abc`, {
        headers: { 'CF-Connecting-IP': '203.0.113.9' },
      });
      expect(ok.status).toBe(200);
    }
    const blocked = await request('/api/v1/geocode?q=rua%20nova%20abc', {
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(60);
  });
});

describe('GET /geocode (Google Places New, key set)', () => {
  const env = { GOOGLE_MAPS_API_KEY: KEY };

  it('autocomplete: POST with key header, pt-BR, MG rectangle and session token', async () => {
    const fetchMock = stub(() =>
      json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJabcdefghijk123',
              structuredFormat: {
                mainText: { text: 'Praça da Liberdade' },
                secondaryText: { text: 'Funcionários, Belo Horizonte - MG, Brasil' },
              },
            },
          },
        ],
      }),
    );
    const { request } = setup(env);
    const res = await request('/api/v1/geocode?q=praca%20liberdade&session=sess_12345678');
    expect(res.status).toBe(200);
    const data = GeocodeSearchResponse.parse((await body(res)).data);
    expect(data.provider).toBe('google');
    expect(data.items[0]).toMatchObject({ id: 'ChIJabcdefghijk123', place: null });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect((init!.headers as Record<string, string>)['X-Goog-Api-Key']).toBe(KEY);
    const sent = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      input: 'praca liberdade',
      languageCode: 'pt-BR',
      includedRegionCodes: ['br'],
      sessionToken: 'sess_12345678',
    });
    expect(sent.locationRestriction).toBeTruthy();
    // the key never appears in the response
    expect(JSON.stringify(data)).not.toContain(KEY);
  });

  it('falls back to Photon when Google fails', async () => {
    stub((url) =>
      url.startsWith('https://places.googleapis.com')
        ? new Response('denied', { status: 403 })
        : json({ features: [photonFeature()] }),
    );
    const { request } = setup(env);
    const res = await request('/api/v1/geocode?q=praca%20liberdade');
    expect(GeocodeSearchResponse.parse((await body(res)).data).provider).toBe('photon');
  });

  it('place details: minimal field mask, normalizes components, rejects outside MG', async () => {
    const fetchMock = stub((url) =>
      url.includes('ChIJoutsideMG0001')
        ? json({
            location: { latitude: -23.55, longitude: -46.63 },
            formattedAddress: 'São Paulo, Brasil',
            addressComponents: [],
          })
        : json({
            location: { latitude: -19.9322, longitude: -43.9384 },
            formattedAddress: 'Av. Bias Fortes, 10 - Funcionários, Belo Horizonte - MG, Brasil',
            addressComponents: [
              { longText: 'Avenida Bias Fortes', types: ['route'] },
              { longText: '10', types: ['street_number'] },
              { longText: 'Funcionários', types: ['sublocality_level_1', 'sublocality'] },
              { longText: 'Belo Horizonte', types: ['administrative_area_level_2'] },
            ],
          }),
    );
    const { request } = setup(env);
    const res = await request('/api/v1/geocode/place?id=ChIJabcdefghijk123&session=sess_12345678');
    const data = GeocodePlaceResponse.parse((await body(res)).data);
    expect(data.place).toEqual({
      label: 'Av. Bias Fortes, 10 - Funcionários, Belo Horizonte - MG',
      street: 'Avenida Bias Fortes',
      number: '10',
      neighborhood: 'Funcionários',
      city: 'Belo Horizonte',
      coordinates: [-43.9384, -19.9322],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('sessionToken')).toBe('sess_12345678');
    expect((init!.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'location,formattedAddress,addressComponents',
    );
    const out = await request('/api/v1/geocode/place?id=ChIJoutsideMG0001');
    expect(out.status).toBe(422);
  });
});

describe('GET /geocode/resolve (anti-SSRF)', () => {
  const resolve = (request: ReturnType<typeof setup>['request'], url: string) =>
    request(`/api/v1/geocode/resolve?url=${encodeURIComponent(url)}`);

  it('rejects hosts outside the allowlist without any fetch', async () => {
    const fetchMock = stub(() => json({}));
    const { request } = setup();
    for (const bad of [
      'https://evil.example.com/maps/@-19.9,-43.9,15z',
      'https://169.254.169.254/latest/meta-data',
      'http://www.google.com/maps/@-19.9,-43.9,15z',
      'https://www.google.com.evil.com/maps/@-19.9,-43.9,15z',
      'https://maps.app.goo.gl.evil.com/abc',
      'https://goo.gl/other/abc',
      'https://user:pw@maps.app.goo.gl/abc',
    ]) {
      const res = await resolve(request, bad);
      expect(res.status, bad).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('full link: extracts coordinates (no redirect fetch) and suggests an address', async () => {
    const fetchMock = stub(() => json({ features: [photonFeature()] }));
    const { request } = setup();
    const res = await resolve(
      request,
      'https://www.google.com/maps/place/Pra%C3%A7a/@-19.93,-43.94,17z/data=!3d-19.9322!4d-43.9384',
    );
    expect(res.status).toBe(200);
    const data = GeocodeResolveResponse.parse((await body(res)).data);
    expect(data.coordinates).toEqual([-43.9384, -19.9322]);
    expect(data.place?.city).toBe('Belo Horizonte');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('photon.komoot.io/reverse');
  });

  it('keeps the coordinates when the reverse lookup fails', async () => {
    stub(() => new Response('x', { status: 500 }));
    const { request } = setup();
    const res = await resolve(request, 'https://maps.google.com/?q=-19.9191,-43.9386');
    expect(res.status).toBe(200);
    const data = GeocodeResolveResponse.parse((await body(res)).data);
    expect(data).toMatchObject({ coordinates: [-43.9386, -19.9191], place: null });
  });

  it('short link: follows redirects by hand, only through allowed hosts', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    stub((url, init) => {
      calls.push({ url, init });
      if (url.startsWith('https://maps.app.goo.gl/'))
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://www.google.com/maps/place/X/@-19.9191,-43.9386,17z' },
        });
      return json({ features: [] });
    });
    const { request } = setup();
    const res = await resolve(request, 'https://maps.app.goo.gl/AbCdEf123');
    expect(res.status).toBe(200);
    expect(GeocodeResolveResponse.parse((await body(res)).data).coordinates).toEqual([
      -43.9386, -19.9191,
    ]);
    expect(calls[0]!.init).toMatchObject({ redirect: 'manual', method: 'GET' });
    expect(calls[0]!.init?.headers).not.toHaveProperty('Cookie');
  });

  it('short link redirecting to a non-allowed host is NOT followed', async () => {
    const fetchMock = stub(
      () =>
        new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest' } }),
    );
    const { request } = setup();
    const res = await resolve(request, 'https://maps.app.goo.gl/AbCdEf123');
    expect(res.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coordinates outside MG -> clear 422', async () => {
    stub(() => json({ features: [] }));
    const { request } = setup();
    const res = await resolve(request, 'https://www.google.com/maps/@-23.55,-46.63,15z');
    expect(res.status).toBe(422);
    expect((await body(res)).error?.message).toMatch(/fora de Minas Gerais/);
  });

  it('short link timeout -> generic 503', async () => {
    vi.useFakeTimers();
    stub(
      (_url, init) =>
        new Promise<Response>((_r, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('x', 'AbortError')),
          );
        }) as unknown as Response,
    );
    const { request } = setup();
    const pending = resolve(request, 'https://maps.app.goo.gl/AbCdEf123');
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(503);
  });
});
