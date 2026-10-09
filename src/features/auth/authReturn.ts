/**
 * Magic-link return handling (/autenticacao/retorno). Supports the three shapes
 * Supabase can produce:
 *  - implicit: `#access_token=…&refresh_token=…&type=magiclink` (link sent by the Worker);
 *  - token hash: `?token_hash=…&type=magiclink|email|signup|email_change` (custom template);
 *  - PKCE: `?code=…` (only works in the browser that started the flow).
 * Tokens are read once, the URL is cleaned immediately and nothing is logged.
 */
import type { EmailOtpType } from '@supabase/supabase-js';
import { MeResponse } from '@shared/contracts/registration.ts';
import type { MeResponse as MeResponseT } from '@shared/contracts/registration.ts';
import { ApiClientError } from '@/lib/api';
import { authedRequest, consumeAuthNext, loadSupabase, safeRedirectPath } from '@/lib/auth';

export type ReturnParams =
  | { kind: 'implicit'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string; type: EmailOtpType }
  | { kind: 'code'; code: string }
  | { kind: 'error'; errorCode: string }
  | { kind: 'none' };

const OTP_TYPES = new Set<EmailOtpType>(['magiclink', 'email', 'signup', 'email_change']);

export function parseAuthReturn(href: string): { params: ReturnParams; next: string | null } {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { params: { kind: 'none' }, next: null };
  }
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const query = url.searchParams;
  const nextRaw = query.get('next');
  const next = nextRaw ? safeRedirectPath(nextRaw, '') || null : null;

  const errorCode =
    hash.get('error_code') ?? query.get('error_code') ?? hash.get('error') ?? query.get('error');
  if (errorCode) return { params: { kind: 'error', errorCode }, next };

  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    return { params: { kind: 'implicit', accessToken, refreshToken }, next };
  }
  const tokenHash = query.get('token_hash');
  const type = query.get('type') as EmailOtpType | null;
  if (tokenHash && type && OTP_TYPES.has(type)) {
    return { params: { kind: 'token_hash', tokenHash, type }, next };
  }
  const code = query.get('code');
  if (code) return { params: { kind: 'code', code }, next };
  return { params: { kind: 'none' }, next };
}

/** Removes tokens/codes from the address bar and history entry (keeps router state). */
export function scrubAuthUrl(): void {
  try {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  } catch {
    // ignore (non-browser env)
  }
}

export type ReturnOutcome =
  | { status: 'success'; next: string; me: MeResponseT | null }
  | { status: 'expired' }
  | { status: 'invalid'; reason: 'no_params' | 'rejected' | 'other_browser' }
  | { status: 'unconfirmed'; message: string }
  | { status: 'error'; message: string; canRetry: boolean };

function isExpired(code: string | undefined, status?: number): boolean {
  return code === 'otp_expired' || code === 'flow_state_expired' || status === 403;
}

/** Calls POST /auth/confirm-email and refreshes the session (JWT with is_anonymous=false). */
export async function confirmAndRefresh(next: string): Promise<ReturnOutcome> {
  const sb = await loadSupabase();
  if (!sb) return { status: 'error', message: 'Login não configurado.', canRetry: false };
  let confirmed: MeResponseT;
  try {
    confirmed = await authedRequest('/auth/confirm-email', MeResponse, {
      method: 'POST',
      body: {},
    });
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'EMAIL_NOT_VERIFIED') {
      return { status: 'unconfirmed', message: err.message };
    }
    if (err instanceof ApiClientError && err.code === 'UNAUTHENTICATED') {
      return { status: 'expired' };
    }
    return {
      status: 'error',
      message:
        err instanceof ApiClientError
          ? err.message
          : 'Não foi possível confirmar seu e-mail agora.',
      canRetry: true,
    };
  }
  const { data, error } = await sb.auth.refreshSession();
  if (error || !data.session) {
    return {
      status: 'error',
      message:
        'Seu e-mail foi confirmado, mas não conseguimos atualizar a sessão. Peça um novo link para entrar.',
      canRetry: false,
    };
  }
  // P-SEC-1: read the profile with the refreshed (verified) session; the page asks
  // the person to review it when `profile_review_required` is set.
  let me: MeResponseT | null = confirmed;
  try {
    me = await authedRequest('/me', MeResponse, { session: data.session });
  } catch {
    // keep the confirm-email answer
  }
  return { status: 'success', next, me };
}

export async function processAuthReturn(href: string): Promise<ReturnOutcome> {
  const { params, next: queryNext } = parseAuthReturn(href);
  const next = consumeAuthNext() ?? queryNext ?? '/';
  const sb = await loadSupabase();
  if (!sb) return { status: 'error', message: 'Login não configurado.', canRetry: false };

  switch (params.kind) {
    case 'none':
      return { status: 'invalid', reason: 'no_params' };
    case 'error':
      return isExpired(params.errorCode)
        ? { status: 'expired' }
        : { status: 'invalid', reason: 'rejected' };
    case 'implicit': {
      const { error } = await sb.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });
      if (error)
        return isExpired(error.code, error.status)
          ? { status: 'expired' }
          : { status: 'invalid', reason: 'rejected' };
      break;
    }
    case 'token_hash': {
      const { error } = await sb.auth.verifyOtp({
        token_hash: params.tokenHash,
        type: params.type,
      });
      if (error)
        return isExpired(error.code, error.status)
          ? { status: 'expired' }
          : { status: 'invalid', reason: 'rejected' };
      break;
    }
    case 'code': {
      const { error } = await sb.auth.exchangeCodeForSession(params.code);
      if (error) return { status: 'invalid', reason: 'other_browser' };
      break;
    }
  }
  return confirmAndRefresh(next);
}
