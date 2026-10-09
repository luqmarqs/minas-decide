/**
 * Supabase client for the OPERATIONAL project (TARGET) only — used for Auth
 * session handling (magic link / provisional session). The browser never writes
 * operational tables directly: mutations go through the Worker API. Electoral
 * data never comes from Supabase at runtime (static snapshot in /data).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return (
    typeof url === 'string' &&
    url.startsWith('https://') &&
    !url.includes('<') &&
    typeof key === 'string' &&
    key.length > 20 &&
    !key.includes('<')
  );
}

/** Lazily created singleton; `null` when env is missing (UI must degrade honestly). */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!isSupabaseConfigured()) {
    client = null;
    return client;
  }
  client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      // /autenticacao/retorno handles the callback explicitly.
      detectSessionInUrl: false,
    },
  });
  return client;
}
