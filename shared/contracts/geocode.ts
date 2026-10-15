/**
 * Address search (D53): GET /geocode, GET /geocode/place, GET /geocode/resolve. The browser only
 * talks to the Worker; the Worker proxies Google Places (New) when a key is configured and
 * Photon (OSM) otherwise. Public data only; no personal data.
 */
import { z } from 'zod';

const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** A resolved place, already normalized: coordinates are [lon, lat]. */
export const GeocodePlace = z.object({
  label: z.string().max(300),
  street: z.string().max(160).nullable(),
  number: z.string().max(30).nullable(),
  neighborhood: z.string().max(120).nullable(),
  city: z.string().max(120).nullable(),
  coordinates: LonLat,
});
export type GeocodePlace = z.infer<typeof GeocodePlace>;

export const GeocodeProvider = z.enum(['google', 'photon']);
export type GeocodeProvider = z.infer<typeof GeocodeProvider>;

/** One autocomplete suggestion. `place` is null when details must be fetched (Google). */
export const GeocodeSuggestion = z.object({
  id: z.string().min(1).max(320),
  label: z.string().max(300),
  secondary: z.string().max(300).nullable(),
  place: GeocodePlace.nullable(),
});
export type GeocodeSuggestion = z.infer<typeof GeocodeSuggestion>;

export const GeocodeSearchResponse = z.object({
  provider: GeocodeProvider,
  items: z.array(GeocodeSuggestion).max(10),
});
export type GeocodeSearchResponse = z.infer<typeof GeocodeSearchResponse>;

export const GeocodePlaceResponse = z.object({
  provider: GeocodeProvider,
  place: GeocodePlace,
});
export type GeocodePlaceResponse = z.infer<typeof GeocodePlaceResponse>;

/** Pasted Google Maps link: the point, plus a suggested address when the reverse lookup worked. */
export const GeocodeResolveResponse = z.object({
  coordinates: LonLat,
  place: GeocodePlace.nullable(),
  provider: GeocodeProvider.nullable(),
});
export type GeocodeResolveResponse = z.infer<typeof GeocodeResolveResponse>;

/** Client-generated token of one typing session (Google bills per session). */
export const GeocodeSessionToken = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const GeocodePlaceId = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/);
