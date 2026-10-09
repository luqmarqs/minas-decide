/**
 * Zod/supabase-free hint of whether a Supabase session may exist, so the header
 * can skip downloading supabase-js on public pages for visitors who never signed
 * in (P-PERF-1). It only checks for the presence of supabase-js' storage key
 * (`sb-<ref>-auth-token`) — it never reads or parses the token.
 */
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let supabaseLoaded = false;

/** Called by `loadSupabase()` once supabase-js is in memory. */
export function markSupabaseLoaded(): void {
  if (supabaseLoaded) return;
  supabaseLoaded = true;
  listeners.forEach((l) => l());
}

const KEY_RE = /^sb-.+-auth-token$/;

export function hasStoredSession(): boolean {
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && KEY_RE.test(k)) return true;
    }
  } catch {
    // storage unavailable
  }
  return false;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || KEY_RE.test(e.key)) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** `true` when supabase-js is already loaded or a stored session key exists. */
export function useSessionMaybePresent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => supabaseLoaded || hasStoredSession(),
    () => false,
  );
}

/** Test-only reset. */
export function __resetSessionPresence(): void {
  supabaseLoaded = false;
}
