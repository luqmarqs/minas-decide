import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { clientIp } from '../http.ts';
import { subjectHash } from './rate-limit.ts';

function bearer(c: Context<AppBindings>): string | null | 'malformed' {
  const h = c.req.header('Authorization');
  if (!h) return null;
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(h.trim());
  return m?.[1] ?? 'malformed';
}

async function resolveUser(c: Context<AppBindings>, required: boolean): Promise<AuthUser | null> {
  const token = bearer(c);
  if (token === null) {
    if (required) throw fail('UNAUTHENTICATED');
    return null;
  }
  if (token === 'malformed') throw fail('UNAUTHENTICATED');
  const user = await c.get('deps').auth.getUser(token);
  if (!user) throw fail('UNAUTHENTICATED', 'Sessão inválida ou expirada. Entre novamente.');
  c.set('user', user);
  c.set('token', token);
  return user;
}

/** Uses the session when a Bearer token is sent (invalid token -> 401); otherwise anonymous. */
export const optionalSession: MiddlewareHandler<AppBindings> = async (c, next) => {
  await resolveUser(c, false);
  await next();
};

/** Any valid Supabase session, including provisional (anonymous) ones. */
export const requireSession: MiddlewareHandler<AppBindings> = async (c, next) => {
  await resolveUser(c, true);
  await next();
};

/** Case-insensitive e-mail equality (Auth stores addresses lower-cased). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/** Organizer = permanent identity with e-mail confirmed by Auth, re-checked in the database. */
export async function assertOrganizer(c: Context<AppBindings>, user: AuthUser): Promise<void> {
  if (user.is_anonymous || user.jwt_is_anonymous || !user.email_confirmed) {
    throw fail('EMAIL_NOT_VERIFIED');
  }
  const { repo } = c.get('deps');
  if (!(await repo.isEmailVerified(user.id))) throw fail('EMAIL_NOT_VERIFIED');
  // QA-1 F01: an organizer must have a profile created through the guarded
  // registration flow (Turnstile + consent), be active and have its e-mail state
  // promoted by /auth/confirm-email. Auth-only accounts (direct GoTrue signup) are refused.
  const profile = await repo.getProfile(user.id);
  if (!profile) throw fail('FORBIDDEN');
  if (profile.account_state !== 'active') throw fail('FORBIDDEN');
  if (profile.email_verification_state !== 'verified') throw fail('EMAIL_NOT_VERIFIED');
  // QA2-01: the Auth address changed outside the Worker (e.g. GoTrue e-mail change) and the
  // profile was not re-synced by /auth/confirm-email (which also revokes the other sessions
  // and flags the profile for review). Never organize with a stale contact e-mail.
  if (!sameEmail(profile.email_contact, user.email)) {
    throw fail(
      'FORBIDDEN',
      'Seu e-mail mudou. Abra o link de confirmação e revise seus dados antes de continuar.',
    );
  }
  // P-SEC-1: after a magic-link promotion the person must confirm/edit the profile
  // data (which may have been entered by someone else) before acting as organizer.
  if (profile.review_required_at) {
    throw fail('FORBIDDEN', 'Confira seus dados de perfil antes de propor atividades.');
  }
}

export const requireOrganizer: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true);
  if (user) await assertOrganizer(c, user);
  await next();
};

/**
 * Returns true when the user may act as admin: permanent account, confirmed e-mail and listed
 * in app_private.admins. MFA is not required (D35) in any APP_ENV.
 */
export async function isAdminWithMfa(c: Context<AppBindings>, user: AuthUser): Promise<boolean> {
  // D35 (owner decision, 2026-10-09): MFA is no longer required for admins. An admin is a
  // permanent (non-anonymous) account with a confirmed e-mail listed in app_private.admins.
  // The function keeps its name so call sites and tests stay stable.
  if (user.is_anonymous || user.jwt_is_anonymous) return false;
  if (!user.email_confirmed) return false;
  return c.get('deps').repo.isAdmin(user.id);
}

export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true);
  if (!user || !(await isAdminWithMfa(c, user))) {
    try {
      await c.get('deps').repo.recordAbuse({
        subject_hash: await subjectHash(c.env.RSVP_DEVICE_SECRET, clientIp(c)),
        route: 'admin',
        event_type: 'admin_denied',
        block_code: 'FORBIDDEN',
      });
    } catch {
      // best effort
    }
    throw fail('FORBIDDEN');
  }
  await next();
};
