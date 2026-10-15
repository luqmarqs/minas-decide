/**
 * Google Maps links (D53): host allowlist (anti-SSRF, shared by the Worker resolver and the
 * client detector) and coordinate extraction. Pure functions, no I/O.
 */

/** Rough MG bounding box [minLon, minLat, maxLon, maxLat]; used to restrict/validate points. */
export const MG_BBOX = [-51.05, -22.95, -39.85, -14.2] as const;

export function insideMgBbox(lon: number, lat: number): boolean {
  return lon >= MG_BBOX[0] && lon <= MG_BBOX[2] && lat >= MG_BBOX[1] && lat <= MG_BBOX[3];
}

const FULL_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'maps.google.com',
  'www.google.com.br',
  'google.com.br',
  'maps.google.com.br',
]);
/** Only reachable as an intermediate redirect hop (its `continue` param is re-validated). */
export const CONSENT_HOST = 'consent.google.com';

export type GoogleMapsLinkKind = 'short' | 'full';

/** Classifies a URL against the fixed allowlist; null = not an allowed Google Maps link. */
export function googleMapsLinkKind(raw: string): GoogleMapsLinkKind | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return 'short';
  if (host === 'goo.gl') return u.pathname.startsWith('/maps') ? 'short' : null;
  if (FULL_HOSTS.has(host)) {
    return host.startsWith('maps.') || u.pathname.startsWith('/maps') ? 'full' : null;
  }
  return null;
}

const PIN_RE = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/;
const AT_RE = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/;
const PAIR_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const QUERY_KEYS = ['q', 'll', 'query', 'destination', 'center', 'daddr'];

function toLonLat(lat: string | undefined, lon: string | undefined): [number, number] | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return [lo, la];
}

/**
 * Extracts [lon, lat] from a Google Maps URL: `!3dLAT!4dLNG` (the place pin) first, then
 * `@lat,lng` (viewport center), then `q=`/`ll=`/`query=`/… holding "lat,lng".
 */
export function parseGoogleMapsCoords(raw: string): [number, number] | null {
  let text = raw.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // keep the raw text
  }
  const pin = PIN_RE.exec(text);
  if (pin) return toLonLat(pin[1], pin[2]);
  const at = AT_RE.exec(text);
  if (at) return toLonLat(at[1], at[2]);
  try {
    const u = new URL(raw.trim());
    for (const k of QUERY_KEYS) {
      const m = PAIR_RE.exec(u.searchParams.get(k) ?? '');
      if (m) return toLonLat(m[1], m[2]);
    }
  } catch {
    // not a URL
  }
  return null;
}
