/**
 * TOTP MFA on top of Supabase Auth (P-AUTH-1). Nothing here implements crypto:
 * enrolment, challenge and verification are Supabase Auth calls; the Worker only
 * trusts the `aal` claim of the (refreshed) JWT. Secrets and codes are never
 * logged nor persisted by the app.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthUnavailableError, loadSupabase } from '@/lib/auth';

export class MfaError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_code' | 'unavailable' | 'needs_aal2' | 'failed',
  ) {
    super(message);
    this.name = 'MfaError';
  }
}

export interface TotpFactor {
  id: string;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
  createdAt: string;
}

export interface TotpEnrollment {
  factorId: string;
  /** `data:` URL of the QR code (SVG) — rendered with <img>, CSP allows `data:`. */
  qrDataUrl: string;
  /** Base32 secret for manual entry in the authenticator app. */
  secret: string;
  /** otpauth:// URI (opens the authenticator app on phones). */
  uri: string;
}

export interface Assurance {
  current: string | null;
  next: string | null;
}

async function client(): Promise<SupabaseClient> {
  const sb = await loadSupabase();
  if (!sb) throw new AuthUnavailableError();
  return sb;
}

function mapError(err: { code?: string; status?: number; message?: string } | null): MfaError {
  const code = err?.code ?? '';
  if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired') {
    return new MfaError(
      'Código incorreto ou expirado. Confira o app e tente de novo.',
      'invalid_code',
    );
  }
  if (code === 'insufficient_aal') {
    return new MfaError('Confirme um código do seu autenticador antes desta ação.', 'needs_aal2');
  }
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') {
    return new MfaError(
      'A verificação em duas etapas não está habilitada neste ambiente.',
      'unavailable',
    );
  }
  if (err?.status === 429) {
    return new MfaError('Muitas tentativas. Aguarde um pouco e tente de novo.', 'failed');
  }
  return new MfaError('Não foi possível concluir agora. Tente de novo em instantes.', 'failed');
}

/** QR code from Supabase may come as a data URL or as raw SVG markup. */
export function qrDataUrl(qr: string): string {
  if (qr.startsWith('data:')) return qr;
  return `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
}

export async function getAssurance(): Promise<Assurance> {
  const sb = await client();
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw mapError(error);
  return { current: data.currentLevel ?? null, next: data.nextLevel ?? null };
}

/** True when the session must step up to aal2 (a verified factor exists). */
export function needsStepUp(a: Assurance): boolean {
  return a.next === 'aal2' && a.current !== 'aal2';
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const sb = await client();
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error || !data) throw mapError(error);
  return data.all
    .filter((f) => f.factor_type === 'totp')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status === 'verified' ? 'verified' : 'unverified',
      createdAt: f.created_at,
    }));
}

/**
 * Starts a TOTP enrolment. Abandoned (unverified) TOTP factors are removed first
 * so a retry never collides with a stale one.
 */
export async function enrollTotp(): Promise<TotpEnrollment> {
  const sb = await client();
  for (const f of await listTotpFactors()) {
    if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Autenticador ${stamp}`,
  });
  if (error || !data || data.type !== 'totp') throw mapError(error);
  return {
    factorId: data.id,
    qrDataUrl: qrDataUrl(data.totp.qr_code),
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/**
 * challenge + verify a 6-digit code, then refresh the session so the Worker sees
 * a JWT with `aal: aal2`.
 */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) {
    throw new MfaError('Digite os 6 números mostrados no app autenticador.', 'invalid_code');
  }
  const sb = await client();
  const challenge = await sb.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw mapError(challenge.error);
  const verified = await sb.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: clean,
  });
  if (verified.error) throw mapError(verified.error);
  const refreshed = await sb.auth.refreshSession();
  if (refreshed.error) throw mapError(refreshed.error);
}

export async function unenrollFactor(factorId: string): Promise<void> {
  const sb = await client();
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if (error) throw mapError(error);
  await sb.auth.refreshSession();
}

/** Groups a base32 secret in blocks of 4 for manual typing. */
export function groupSecret(secret: string): string {
  return secret
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}
