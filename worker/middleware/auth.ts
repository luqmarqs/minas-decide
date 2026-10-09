import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { clientIp } from '../http.ts';
import type { ProfileRow } from '../repositories/types.ts';
import { subjectHash } from './rate-limit.ts';

/**
 * Authentication = Clerk (ADR 0005). The client sends the Clerk session token as
 * `Authorization: Bearer <jwt>`; the Worker verifies it (JWKS signature, exp/nbf, azp) through
 * the injected AuthGateway and resolves the primary e-mail + verification status either from
 * custom session claims (`email`, `email_verified`) or from the Clerk Backend API (once per
 * request — the AuthUser is memoised in the request context).
 */
function bearer(c: Context<AppBindings>): string | null | 'malformed' {
  const h = c.req.header('Authorization');
  if (!h) return null;
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(h.trim());
  return m?.[1] ?? 'malformed';
}

const INVALID_SESSION = 'Sessão inválida ou expirada. Entre novamente.';

async function resolveUser(c: Context<AppBindings>, required: boolean): Promise<AuthUser | null> {
  const cached = c.get('user');
  if (cached) return cached;
  const token = bearer(c);
  if (token === null) {
    if (required) throw fail('UNAUTHENTICATED');
    return null;
  }
  if (token === 'malformed') throw fail('UNAUTHENTICATED');
  const { auth } = c.get('deps');
  const session = await auth.verify(token);
  if (!session) throw fail('UNAUTHENTICATED', INVALID_SESSION);
  // Session tasks (e.g. pending org selection) are not a usable session.
  const sts = session.claims.sts;
  if (sts !== undefined && sts !== 'active') throw fail('UNAUTHENTICATED', INVALID_SESSION);

  let email: string | null;
  let emailVerified: boolean;
  const claimEmail = session.claims.email;
  const claimVerified = session.claims.email_verified;
  if (typeof claimEmail === 'string' && typeof claimVerified === 'boolean') {
    email = claimEmail.trim().toLowerCase() || null;
    emailVerified = claimVerified;
  } else {
    const info = await auth.getUser(session.sub);
    if (!info || info.banned || info.id !== session.sub) {
      throw fail('UNAUTHENTICATED', INVALID_SESSION);
    }
    email = info.email;
    emailVerified = info.email_verified;
  }
  const user: AuthUser = {
    id: session.sub,
    email,
    email_confirmed: Boolean(email) && emailVerified,
    is_anonymous: false,
  };
  c.set('user', user);
  return user;
}

/** Uses the session when a Bearer token is sent (invalid token -> 401); otherwise anonymous. */
export const optionalSession: MiddlewareHandler<AppBindings> = async (c, next) => {
  await resolveUser(c, false);
  await next();
};

/** Any valid Clerk session (verified e-mail is checked by the routes that need it). */
export const requireSession: MiddlewareHandler<AppBindings> = async (c, next) => {
  await resolveUser(c, true);
  await next();
};

/** Case-insensitive e-mail equality. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/**
 * Keeps `profiles.email_contact` equal to the VERIFIED primary e-mail in Clerk. Clerk only lets
 * a verified address become primary, so a change made in the Clerk account UI is re-synced
 * (audited without PII). Refused when another profile already holds that address.
 */
export async function syncProfileEmail(
  c: Context<AppBindings>,
  user: AuthUser,
  profile: ProfileRow,
): Promise<ProfileRow> {
  if (!user.email || !user.email_confirmed || sameEmail(profile.email_contact, user.email)) {
    return profile;
  }
  const { repo } = c.get('deps');
  if (await repo.emailInUse(user.email, user.id)) {
    throw fail('CONFLICT', 'Este e-mail já está associado a outro cadastro.');
  }
  const updated = await repo.updateProfile(user.id, { email_contact: user.email });
  await repo.recordAudit({
    actor: user.id,
    action: 'profile.email_changed',
    entity_type: 'profile',
    entity_id: user.id,
    request_id: c.get('requestId'),
  });
  return updated ?? profile;
}

/**
 * Organizer = Clerk session with a verified primary e-mail + a profile created through the
 * guarded registration flow (Turnstile + consent), active and verified.
 */
export async function assertOrganizer(c: Context<AppBindings>, user: AuthUser): Promise<void> {
  if (!user.email_confirmed) throw fail('EMAIL_NOT_VERIFIED');
  const profile = await c.get('deps').repo.getProfile(user.id);
  // QA-1 F01: accounts that never went through POST /registrations cannot organize.
  if (!profile) throw fail('FORBIDDEN');
  if (profile.account_state !== 'active') throw fail('FORBIDDEN');
  if (profile.email_verification_state !== 'verified') throw fail('EMAIL_NOT_VERIFIED');
  await syncProfileEmail(c, user, profile);
}

export const requireOrganizer: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true);
  if (user) await assertOrganizer(c, user);
  await next();
};

/**
 * Admin = Clerk session with a verified primary e-mail whose Clerk user id is listed in
 * app_private.admins. MFA is not required (D35). The name is kept for call-site stability.
 */
export async function isAdminWithMfa(c: Context<AppBindings>, user: AuthUser): Promise<boolean> {
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
