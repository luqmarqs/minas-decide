import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../env.ts';
import { isLocal } from '../env.ts';
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
}

export const requireOrganizer: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true);
  if (user) await assertOrganizer(c, user);
  await next();
};

/** Returns true when the user may act as admin (admins table + aal2, or the local MFA bypass). */
export async function isAdminWithMfa(c: Context<AppBindings>, user: AuthUser): Promise<boolean> {
  if (user.is_anonymous) return false;
  if (!(await c.get('deps').repo.isAdmin(user.id))) return false;
  if (user.aal === 'aal2') return true;
  if (isLocal(c.env)) {
    // Explicit, logged bypass. APP_ENV=local only — impossible in staging/production.
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'ADMIN_MFA_BYPASS_LOCAL',
        request_id: c.get('requestId'),
      }),
    );
    return true;
  }
  return false;
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
