/**
 * Address search providers (D53). Google Places (New) when GOOGLE_MAPS_API_KEY is set, Photon
 * (OSM, no key) otherwise. The key never leaves the Worker; search text is never logged.
 */
import { z } from 'zod';
import type {
  GeocodePlace,
  GeocodeProvider,
  GeocodeSuggestion,
} from '../../shared/contracts/geocode.ts';
import { insideMgBbox, MG_BBOX } from '../../shared/schemas/google-maps.ts';
import { normalizeText } from '../../shared/schemas/normalize.ts';
import type { Env } from '../env.ts';
import { fail } from '../errors.ts';

export const UPSTREAM_TIMEOUT_MS = 4000;
const PHOTON = 'https://photon.komoot.io';
const PLACES = 'https://places.googleapis.com/v1';
const GEOCODING = 'https://maps.googleapis.com/maps/api/geocode/json';
const UNAVAILABLE = 'Busca de endereços indisponível no momento. Digite o endereço manualmente.';

export function activeProvider(env: Pick<Env, 'GOOGLE_MAPS_API_KEY'>): GeocodeProvider {
  return env.GOOGLE_MAPS_API_KEY?.trim() ? 'google' : 'photon';
}

/** fetch + JSON with a short timeout; any failure becomes a generic SERVICE_UNAVAILABLE. */
async function upstreamJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      redirect: 'manual',
      headers: { Accept: 'application/json', ...(init.headers as Record<string, string>) },
    });
    if (!res.ok) throw new Error('upstream status');
    return (await res.json()) as unknown;
  } catch {
    throw fail('SERVICE_UNAVAILABLE', UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}

const clip = (s: string | null | undefined, n: number): string | null => {
  const t = s?.trim();
  return t ? t.slice(0, n) : null;
};

// ---------------------------------------------------------------------------------- Photon

const PhotonFeature = z.object({
  geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
  properties: z
    .object({
      osm_type: z.string().optional(),
      osm_id: z.union([z.number(), z.string()]).optional(),
      name: z.string().optional(),
      street: z.string().optional(),
      housenumber: z.string().optional(),
      district: z.string().optional(),
      suburb: z.string().optional(),
      locality: z.string().optional(),
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      county: z.string().optional(),
      state: z.string().optional(),
      countrycode: z.string().optional(),
    })
    .passthrough(),
});
const PhotonCollection = z.object({ features: z.array(PhotonFeature) });

function photonPlace(f: z.infer<typeof PhotonFeature>): GeocodePlace | null {
  const p = f.properties;
  const lon = f.geometry.coordinates[0] ?? NaN;
  const lat = f.geometry.coordinates[1] ?? NaN;
  if (!insideMgBbox(lon, lat)) return null;
  if (p.countrycode && p.countrycode.toUpperCase() !== 'BR') return null;
  if (p.state && normalizeText(p.state) !== 'minas gerais') return null;
  const street = clip(p.street, 160);
  const number = clip(p.housenumber, 30);
  const neighborhood = clip(p.suburb ?? p.district ?? p.locality, 120);
  const city = clip(p.city ?? p.town ?? p.village ?? p.county, 120);
  const name = clip(p.name, 160);
  const streetPart = street ? (number ? `${street}, ${number}` : street) : null;
  const parts: string[] = [];
  for (const part of [name !== street ? name : null, streetPart, neighborhood, city]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  const label = parts.join(', ').slice(0, 300);
  if (!label) return null;
  return { label, street, number, neighborhood, city, coordinates: [lon, lat] };
}

function photonSuggestions(json: unknown): GeocodeSuggestion[] {
  const parsed = PhotonCollection.safeParse(json);
  if (!parsed.success) throw fail('SERVICE_UNAVAILABLE', UNAVAILABLE);
  const out: GeocodeSuggestion[] = [];
  for (const f of parsed.data.features) {
    const place = photonPlace(f);
    if (!place) continue;
    const id = `osm-${f.properties.osm_type ?? 'x'}${f.properties.osm_id ?? out.length}`;
    const [first, ...rest] = place.label.split(', ');
    out.push({
      id,
      label: first ?? place.label,
      secondary: rest.length ? rest.join(', ') : null,
      place,
    });
  }
  return out;
}

const photonHeaders = (): Record<string, string> => ({
  'User-Agent': 'MinasDecide/1.0 (address search proxy)',
});

async function photonSearch(q: string): Promise<GeocodeSuggestion[]> {
  const u = new URL(`${PHOTON}/api/`);
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '6');
  u.searchParams.set('bbox', MG_BBOX.join(','));
  return photonSuggestions(await upstreamJson(u.toString(), { headers: photonHeaders() }));
}

async function photonReverse(lon: number, lat: number): Promise<GeocodePlace | null> {
  const u = new URL(`${PHOTON}/reverse`);
  u.searchParams.set('lon', String(lon));
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('limit', '1');
  const [first] = photonSuggestions(await upstreamJson(u.toString(), { headers: photonHeaders() }));
  return first?.place ? { ...first.place, coordinates: [lon, lat] } : null;
}

// ---------------------------------------------------------------------------------- Google

const Autocomplete = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }).optional(),
            structuredFormat: z
              .object({
                mainText: z.object({ text: z.string() }).optional(),
                secondaryText: z.object({ text: z.string() }).optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const Component = z.object({
  longText: z.string().optional(),
  long_name: z.string().optional(),
  types: z.array(z.string()).default([]),
});
type Component = z.infer<typeof Component>;
const PlaceDetails = z.object({
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  addressComponents: z.array(Component).default([]),
});
const GeocodingResponse = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        formatted_address: z.string().optional(),
        address_components: z.array(Component).default([]),
      }),
    )
    .default([]),
});

function component(list: Component[], ...types: string[]): string | null {
  for (const t of types) {
    const c = list.find((x) => x.types.includes(t));
    const v = clip(c?.longText ?? c?.long_name, 160);
    if (v) return v;
  }
  return null;
}

function googlePlace(
  lon: number,
  lat: number,
  formatted: string | undefined,
  comps: Component[],
): GeocodePlace {
  const street = component(comps, 'route');
  const number = clip(component(comps, 'street_number'), 30);
  const neighborhood = component(comps, 'sublocality_level_1', 'sublocality', 'neighborhood');
  const city = component(comps, 'administrative_area_level_2', 'locality');
  const label =
    (formatted ?? [street, number, neighborhood, city].filter(Boolean).join(', '))
      .replace(/,\s*Brasil$/i, '')
      .slice(0, 300) || 'Local no mapa';
  return { label, street, number, neighborhood, city, coordinates: [lon, lat] };
}

function googleHeaders(env: Env, fieldMask?: string): Record<string, string> {
  return {
    'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY ?? '',
    ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
  };
}

async function googleSearch(
  env: Env,
  q: string,
  session: string | undefined,
): Promise<GeocodeSuggestion[]> {
  const json = await upstreamJson(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers: { ...googleHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: q,
      languageCode: 'pt-BR',
      includedRegionCodes: ['br'],
      locationRestriction: {
        rectangle: {
          low: { latitude: MG_BBOX[1], longitude: MG_BBOX[0] },
          high: { latitude: MG_BBOX[3], longitude: MG_BBOX[2] },
        },
      },
      ...(session ? { sessionToken: session } : {}),
    }),
  });
  const parsed = Autocomplete.safeParse(json);
  if (!parsed.success) throw fail('SERVICE_UNAVAILABLE', UNAVAILABLE);
  const out: GeocodeSuggestion[] = [];
  for (const s of parsed.data.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p) continue;
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text;
    if (!main) continue;
    out.push({
      id: p.placeId,
      label: main.slice(0, 300),
      secondary: clip(p.structuredFormat?.secondaryText?.text, 300),
      place: null,
    });
    if (out.length >= 6) break;
  }
  return out;
}

export async function googlePlaceDetails(
  env: Env,
  id: string,
  session: string | undefined,
): Promise<GeocodePlace> {
  const u = new URL(`${PLACES}/places/${encodeURIComponent(id)}`);
  u.searchParams.set('languageCode', 'pt-BR');
  if (session) u.searchParams.set('sessionToken', session);
  const json = await upstreamJson(u.toString(), {
    headers: googleHeaders(env, 'location,formattedAddress,addressComponents'),
  });
  const parsed = PlaceDetails.safeParse(json);
  if (!parsed.success) throw fail('SERVICE_UNAVAILABLE', UNAVAILABLE);
  const { latitude, longitude } = parsed.data.location;
  if (!insideMgBbox(longitude, latitude))
    throw fail('UNPROCESSABLE', 'Este local fica fora de Minas Gerais.');
  return googlePlace(
    longitude,
    latitude,
    parsed.data.formattedAddress,
    parsed.data.addressComponents,
  );
}

async function googleReverse(env: Env, lon: number, lat: number): Promise<GeocodePlace | null> {
  const u = new URL(GEOCODING);
  u.searchParams.set('latlng', `${lat},${lon}`);
  u.searchParams.set('language', 'pt-BR');
  u.searchParams.set('key', env.GOOGLE_MAPS_API_KEY ?? '');
  const parsed = GeocodingResponse.safeParse(await upstreamJson(u.toString()));
  if (!parsed.success || parsed.data.status !== 'OK') return null;
  const first = parsed.data.results[0];
  return first ? googlePlace(lon, lat, first.formatted_address, first.address_components) : null;
}

// ---------------------------------------------------------------------------------- facade

export async function searchPlaces(
  env: Env,
  q: string,
  session: string | undefined,
): Promise<{ provider: GeocodeProvider; items: GeocodeSuggestion[] }> {
  if (activeProvider(env) === 'google') {
    try {
      return { provider: 'google', items: await googleSearch(env, q, session) };
    } catch {
      // Google unavailable (quota, API disabled, outage): degrade to Photon, same contract.
    }
  }
  return { provider: 'photon', items: await photonSearch(q) };
}

/** Reverse lookup for a pasted link; never throws (the coordinates alone are still useful). */
export async function reversePlace(
  env: Env,
  lon: number,
  lat: number,
): Promise<{ provider: GeocodeProvider; place: GeocodePlace } | null> {
  const attempts: [GeocodeProvider, () => Promise<GeocodePlace | null>][] = [];
  if (activeProvider(env) === 'google')
    attempts.push(['google', () => googleReverse(env, lon, lat)]);
  attempts.push(['photon', () => photonReverse(lon, lat)]);
  for (const [provider, run] of attempts) {
    try {
      const place = await run();
      if (place) return { provider, place };
    } catch {
      // try the next provider
    }
  }
  return null;
}
