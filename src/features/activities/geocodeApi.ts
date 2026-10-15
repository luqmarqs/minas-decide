// Address search (D53). The browser only talks to our Worker; it proxies Google/Photon.
import { apiRequest } from '@/lib/api';
import {
  GeocodePlaceResponse,
  GeocodeResolveResponse,
  GeocodeSearchResponse,
} from '@shared/contracts/geocode.ts';

export function searchAddress(q: string, session: string, signal?: AbortSignal) {
  return apiRequest('/geocode', GeocodeSearchResponse, { query: { q, session }, signal });
}

export function fetchAddressPlace(id: string, session: string) {
  return apiRequest('/geocode/place', GeocodePlaceResponse, { query: { id, session } });
}

export function resolveMapsLink(url: string) {
  return apiRequest('/geocode/resolve', GeocodeResolveResponse, { query: { url } });
}

/** One Google billing session = one typing session; a new token after each selection. */
export function newSessionToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
