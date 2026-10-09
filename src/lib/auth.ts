/**
 * Session helpers on top of Supabase Auth (TARGET project). The browser only holds
 * the Supabase session; every mutation goes through the Worker with
 * `Authorization: Bearer <access_token>`. Tokens are never logged, never put in a
 * URL and never sent to analytics.
 *
 * Levels (docs/SECURITY.md):
 * - provisional: anonymous sign-in (`is_anonymous=true`) — enough to register;
 * - verified: e-mail confirmed via magic link + POST /auth/confirm-email + refreshSession.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { MeResponse } from '@shared/contracts/registration.ts';
import { ApiClientError, apiRequest, type RequestOptions } from './api';
import { markSupabaseLoaded } from './sessionPresence';

export class AuthUnavailableError extends Error {
  constructor(message = 'O serviço de login não está configurado neste ambiente.') {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

/**
 * supabase-js is loaded on demand (separate chunk): the public map never pays for
 * it. `null` = Auth not configured in this environment.
 */
export async function loadSupabase(): Promise<SupabaseClient | null> {
  const m = await import('./supabase');
  const sb = m.getSupabase();
  if (sb) markSupabaseLoaded();
  return sb;
}

export async function getCurrentSession(): Promise<Session | null> {
  const sb = await loadSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

/**
 * Returns the current session or creates a provisional (anonymous) one. Never
 * replaces an existing session (re-submits stay idempotent server-side).
 */
export async function ensureProvisionalSession(): Promise<Session> {
  const sb = await loadSupabase();
  if (!sb) throw new AuthUnavailableError();
  const current = await getCurrentSession();
  if (current) return current;
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.session) {
    const limited = error?.status === 429;
    throw new ApiClientError(
      limited ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
      limited
        ? 'Muitas sessões criadas a partir desta rede. Aguarde alguns minutos e tente de novo.'
        : 'Não foi possível iniciar sua sessão agora. Tente de novo em instantes.',
      { status: error?.status ?? 0 },
    );
  }
  return data.session;
}

/** API request with the current access token; retries once after a refresh on 401. */
export async function authedRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: RequestOptions & { session?: Session | null } = {},
): Promise<z.infer<S>> {
  const { session: given, ...rest } = opts;
  const session = given ?? (await getCurrentSession());
  if (!session) throw new ApiClientError('UNAUTHENTICATED', 'É preciso entrar para continuar.');
  const run = (token: string) =>
    apiRequest(path, schema, {
      ...rest,
      headers: { ...rest.headers, Authorization: `Bearer ${token}` },
    });
  try {
    return await run(session.access_token);
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.code !== 'UNAUTHENTICATED') throw err;
    const sb = await loadSupabase();
    const refreshed = sb ? (await sb.auth.refreshSession()).data.session : null;
    if (!refreshed) throw err;
    return run(refreshed.access_token);
  }
}

export async function signOut(): Promise<void> {
  // QA2-11: drafts may hold address/contact; never leave them behind on shared devices.
  const { clearAllDrafts } = await import('@/features/activities/draftStore');
  clearAllDrafts();
  const sb = await loadSupabase();
  if (!sb) return;
  await sb.auth.signOut({ scope: 'local' });
}

export type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'none'; session: null }
  | { status: 'unconfigured'; session: null }
  | { status: 'active'; session: Session };

/** Reactive Supabase session (no token ever leaves this hook except via authedRequest). */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null });
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void loadSupabase().then(async (sb) => {
      if (!alive) return;
      if (!sb) {
        setState({ status: 'unconfigured', session: null });
        return;
      }
      const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
        if (!alive) return;
        setState(session ? { status: 'active', session } : { status: 'none', session: null });
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      setState(
        data.session
          ? { status: 'active', session: data.session }
          : { status: 'none', session: null },
      );
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);
  return state;
}

export const meQueryKey = (userId: string | null) => ['me', userId] as const;

/**
 * GET /me for the current session. Private data: never cached across users
 * (key includes the user id, staleTime/gcTime 0).
 */
export function useMe(session: Session | null) {
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: meQueryKey(userId),
    enabled: !!session,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => authedRequest('/me', MeResponse, { session, signal }),
  });
}

/** Internal paths a post-login redirect may target (never an open redirect). */
const ALLOWED_EXACT = new Set([
  '/',
  '/minhas-atividades',
  '/criar-atividade',
  '/admin',
  '/conta/seguranca',
]);
const TERRITORY_PATH = /^\/territorio\/mg(?:-\d{7}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)?$/;

export function safeRedirectPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return fallback;
  // Only plain absolute paths: no scheme, no protocol-relative, no backslashes, no
  // encoded tricks, no query/hash smuggling.
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\%@:?#\s]/.test(raw)) return fallback;
  if (ALLOWED_EXACT.has(raw) || TERRITORY_PATH.test(raw)) return raw;
  return fallback;
}

const NEXT_KEY = 'mm.auth.next';

/** Remembers where to go after the e-mail link (validated again when read). */
export function rememberAuthNext(path: string): void {
  try {
    window.sessionStorage.setItem(NEXT_KEY, safeRedirectPath(path));
  } catch {
    // storage unavailable
  }
}

export function consumeAuthNext(): string | null {
  try {
    const v = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    return v ? safeRedirectPath(v) : null;
  } catch {
    return null;
  }
}
