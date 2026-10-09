/**
 * Session helpers on top of Clerk (ADR 0005). The browser holds only the Clerk session;
 * every mutation goes through the Worker with `Authorization: Bearer <Clerk session token>`.
 * Tokens are never logged, never put in a URL and never sent to analytics.
 *
 * Clerk verifies the e-mail (code) before any session exists, so there is no
 * "provisional" level anymore: an active session = verified e-mail.
 */
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { MeResponse } from '@shared/contracts/registration.ts';
import { ApiClientError, apiRequest, type RequestOptions } from './api';
import { getSessionToken, type AuthSession } from './session';

export {
  AuthUnavailableError,
  getCurrentSession,
  getSessionToken,
  registerClerk,
  signOut,
  useSession,
  type UseSessionOptions,
  type AuthSession,
  type ClerkHandle,
  type SessionState,
} from './session';

/** API request with the current Clerk token; retries once with a fresh token on 401. */
export async function authedRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  // `session` is accepted for call-site compatibility; the token always comes from Clerk.
  opts: RequestOptions & { session?: AuthSession | null } = {},
): Promise<z.infer<S>> {
  const { session: _ignored, ...rest } = opts;
  void _ignored;
  const token = await getSessionToken();
  if (!token) throw new ApiClientError('UNAUTHENTICATED', 'É preciso entrar para continuar.');
  const run = (t: string) =>
    apiRequest(path, schema, {
      ...rest,
      headers: { ...rest.headers, Authorization: `Bearer ${t}` },
    });
  try {
    return await run(token);
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.code !== 'UNAUTHENTICATED') throw err;
    const fresh = await getSessionToken({ skipCache: true });
    if (!fresh || fresh === token) throw err;
    return run(fresh);
  }
}

export const meQueryKey = (userId: string | null) => ['me', userId] as const;

/**
 * GET /me for the current session. Private data: never cached across users
 * (key includes the user id, staleTime/gcTime 0).
 */
export function useMe(session: AuthSession | null) {
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: meQueryKey(userId),
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => authedRequest('/me', MeResponse, { signal }),
  });
}

/** Internal paths a post-login redirect may target (never an open redirect). */
const ALLOWED_EXACT = new Set(['/', '/minhas-atividades', '/criar-atividade', '/admin']);
const TERRITORY_PATH = /^\/territorio\/mg(?:-\d{7}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)?$/;

export function safeRedirectPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return fallback;
  // Only plain absolute paths: no scheme, no protocol-relative, no backslashes, no
  // encoded tricks, no query/hash smuggling.
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\%@:?#\s]/.test(raw)) return fallback;
  if (ALLOWED_EXACT.has(raw) || TERRITORY_PATH.test(raw)) return raw;
  return fallback;
}

/** `/entrar?next=…` link for a protected page. */
export function signInHref(next?: string): string {
  const safe = next ? safeRedirectPath(next, '') : '';
  return safe && safe !== '/' ? `/entrar?next=${encodeURIComponent(safe)}` : '/entrar';
}
