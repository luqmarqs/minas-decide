/**
 * Visual identity. The official "Minas Decide" identity (`data-brand="minas-decide"`,
 * docs/IDENTITY_AUDIT.md, accepted by the owner) is the DEFAULT. The former provisional
 * theme survives as `data-brand="provisorio"` for comparison/rollback only:
 * `?brand=0` (or `?brand=provisorio`) switches to it and persists
 * `localStorage['mm.brand']='provisorio'`; `?brand=1` returns to the default and clears it.
 */
import { useSyncExternalStore } from 'react';

export const BRAND_ID = 'minas-decide';
export const PROVISIONAL_ID = 'provisorio';
export type BrandId = typeof BRAND_ID | typeof PROVISIONAL_ID;
export const BRAND_STORAGE_KEY = 'mm.brand';
export const BRAND_FAVICON = '/favicon.svg';
export const PROVISIONAL_FAVICON = '/favicon-provisorio.svg';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Resolve the active identity: official unless the provisional rollback was asked for. */
export function resolveBrand(search: string, storage: StorageLike | null): BrandId {
  const q = new URLSearchParams(search).get('brand');
  const wantsProvisional = q === '0' || q === PROVISIONAL_ID;
  const wantsOfficial = q === '1' || q === BRAND_ID;
  try {
    if (wantsProvisional) {
      storage?.setItem(BRAND_STORAGE_KEY, PROVISIONAL_ID);
      return PROVISIONAL_ID;
    }
    if (wantsOfficial) {
      storage?.removeItem(BRAND_STORAGE_KEY);
      return BRAND_ID;
    }
    return storage?.getItem(BRAND_STORAGE_KEY) === PROVISIONAL_ID ? PROVISIONAL_ID : BRAND_ID;
  } catch {
    // Storage blocked (private mode): the query string alone still works.
    return wantsProvisional ? PROVISIONAL_ID : BRAND_ID;
  }
}

/** Set `data-brand` on <html> and the matching favicon. */
export function applyBrand(brand: BrandId, doc: Document = document): void {
  doc.documentElement.dataset.brand = brand;
  const icon = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  icon?.setAttribute('href', brand === PROVISIONAL_ID ? PROVISIONAL_FAVICON : BRAND_FAVICON);
}

/** Called once from main.tsx before the first render (no flash of another theme). */
export function initBrand(): BrandId {
  if (typeof window === 'undefined') return BRAND_ID;
  const brand = resolveBrand(window.location.search, safeStorage());
  applyBrand(brand);
  return brand;
}

function subscribe(cb: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-brand'] });
  return () => obs.disconnect();
}

/** True unless the provisional rollback theme is active (official identity = default). */
export function useBrandActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.brand !== PROVISIONAL_ID,
    () => true,
  );
}
