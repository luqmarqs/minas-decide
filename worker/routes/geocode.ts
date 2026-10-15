import { Hono } from 'hono';
import { z } from 'zod';
import {
  GeocodePlaceId,
  GeocodeSessionToken,
  type GeocodePlace,
} from '../../shared/contracts/geocode.ts';
import {
  CONSENT_HOST,
  googleMapsLinkKind,
  insideMgBbox,
  parseGoogleMapsCoords,
} from '../../shared/schemas/google-maps.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parse } from '../http.ts';
import { edgeCached } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import {
  activeProvider,
  googlePlaceDetails,
  reversePlace,
  searchPlaces,
  UPSTREAM_TIMEOUT_MS,
} from '../services/geocode.ts';

/**
 * D53: address search proxy. The browser never talks to Google/Photon directly (CSP stays
 * `connect-src 'self'`) and never sees the key. Search text is NOT logged anywhere.
 */
export const geocode = new Hono<AppBindings>();

const SearchQuery = z.object({
  q: z.string().trim().min(3).max(120),
  session: GeocodeSessionToken.optional(),
});
const PlaceQuery = z.object({ id: GeocodePlaceId, session: GeocodeSessionToken.optional() });
const ResolveQuery = z.object({ url: z.string().trim().min(10).max(600) });

const OUT_OF_MG = 'Este local fica fora de Minas Gerais.';
const MAX_HOPS = 5;

geocode.get('/geocode', rateLimit('geocode_ip'), edgeCached(120, ['q']), async (c) => {
  const { q, session } = parse(SearchQuery, c.req.query());
  return ok(c, await searchPlaces(c.env, q, session));
});

geocode.get('/geocode/place', rateLimit('geocode_ip'), edgeCached(300, ['id']), async (c) => {
  const { id, session } = parse(PlaceQuery, c.req.query());
  if (activeProvider(c.env) !== 'google') throw fail('NOT_FOUND');
  return ok(c, {
    provider: 'google' as const,
    place: await googlePlaceDetails(c.env, id, session),
  });
});

/** Follows redirects of a short link by hand, only through allowlisted Google hosts. */
async function followShortLink(start: string): Promise<string | null> {
  let current = start;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const coords = parseGoogleMapsCoords(current);
    if (coords) return current;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      // No cookies/credentials are ever attached by Workers fetch; headers are minimal.
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: ctl.signal,
        headers: { 'User-Agent': 'MinasDecide/1.0 (link resolver)', Accept: 'text/html' },
      });
    } catch {
      throw fail('SERVICE_UNAVAILABLE', 'Não foi possível abrir o link agora. Tente de novo.');
    } finally {
      clearTimeout(timer);
    }
    void res.body?.cancel().catch(() => undefined);
    const loc = res.headers.get('Location');
    if (res.status < 300 || res.status >= 400 || !loc) return null;
    let next: URL;
    try {
      next = new URL(loc, current);
    } catch {
      return null;
    }
    if (next.hostname.toLowerCase() === CONSENT_HOST) {
      const inner = next.searchParams.get('continue');
      if (!inner) return null;
      try {
        next = new URL(inner);
      } catch {
        return null;
      }
    }
    if (!googleMapsLinkKind(next.toString())) return null; // anti-SSRF: leave the allowlist, stop
    current = next.toString();
  }
  return null;
}

geocode.get('/geocode/resolve', rateLimit('geocode_resolve_ip'), async (c) => {
  const { url } = parse(ResolveQuery, c.req.query());
  const kind = googleMapsLinkKind(url);
  if (!kind)
    throw fail(
      'VALIDATION_ERROR',
      'Use um link do Google Maps (google.com/maps ou maps.app.goo.gl).',
    );
  const finalUrl = kind === 'short' ? await followShortLink(url) : url;
  const coordinates = finalUrl ? parseGoogleMapsCoords(finalUrl) : null;
  if (!coordinates)
    throw fail(
      'UNPROCESSABLE',
      'Não encontramos o ponto neste link. Busque o endereço ou marque o local no mapa.',
    );
  if (!insideMgBbox(coordinates[0], coordinates[1])) throw fail('UNPROCESSABLE', OUT_OF_MG);
  const found = await reversePlace(c.env, coordinates[0], coordinates[1]);
  const place: GeocodePlace | null = found?.place ?? null;
  return ok(c, { coordinates, place, provider: found?.provider ?? null });
});
