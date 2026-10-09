import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { clientIp } from '../http.ts';
import type { ClerkUserInfo, ProfileRow, VerifiedSession } from '../repositories/types.ts';
import { subjectHash } from './rate-limit.ts';

/**
 * Authentication = Clerk (ADR 0005). The client sends the Clerk session token as
 * `Authorization: Bearer <jwt>`; the Worker verifies it (JWKS signature, exp/nbf, iss, azp)
 * through the injected AuthGateway and resolves the primary e-mail + verification status either
 * from custom session claims (`email`, `email_verified`) or from the Clerk Backend API.
 *
 * QA3-01: Backend API lookups are cached per isolate for 60 s (`deps.userCache`). Routes that
 * must see the CURRENT Clerk state (registration, admin contact reveal) use the `fresh` mode,
 * which always calls `users.getUser` — even when the token carries e-mail claims, so a banned
 * or locked account is refused there without waiting for the token to expire (QA3-03).
 */
function bearer(c: Context<AppBindings>): string | null | 'malformed' {
  const h = c.req.header('Authorization');
  if (!h) return null;
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(h.trim());
  return m?.[1] ?? 'malformed';
}

const INVALID_SESSION = 'Sessão inválida ou expirada. Entre novamente.';

/** Backend API lookup through the per-isolate cache (or always fresh). */
async function lookupUser(
  c: Context<AppBindings>,
  userId: string,
  fresh: boolean,
): Promise<ClerkUserInfo | null> {
  const { auth, userCache, now } = c.get('deps');
  if (!fresh) {
    const hit = userCache.get(userId, now());
    if (hit) return hit;
  }
  const info = await auth.getUser(userId);
  if (info) userCache.set(userId, info, now());
  else userCache.invalidate(userId);
  return info;
}

async function toAuthUser(
  c: Context<AppBindings>,
  session: VerifiedSession,
  fresh: boolean,
): Promise<AuthUser> {
  let email: string | null;
  let emailVerified: boolean;
  const claimEmail = session.claims.email;
  const claimVerified = session.claims.email_verified;
  if (!fresh && typeof claimEmail === 'string' && typeof claimVerified === 'boolean') {
    email = claimEmail.trim().toLowerCase() || null;
    emailVerified = claimVerified;
  } else {
    const info = await lookupUser(c, session.sub, fresh);
    if (!info || info.banned || info.id !== session.sub) {
      throw fail('UNAUTHENTICATED', INVALID_SESSION);
    }
    email = info.email;
    emailVerified = info.email_verified;
  }
  return {
    id: session.sub,
    email,
    email_confirmed: Boolean(email) && emailVerified,
    is_anonymous: false,
  };
}

async function resolveUser(
  c: Context<AppBindings>,
  required: boolean,
  fresh = false,
): Promise<AuthUser | null> {
  const cached = c.get('user');
  if (cached && !fresh) return cached;
  const token = bearer(c);
  if (token === null) {
    if (required) throw fail('UNAUTHENTICATED');
    return null;
  }
  if (token === 'malformed') throw fail('UNAUTHENTICATED');
  const { auth } = c.get('deps');
  // QA3-05: an outage throws SERVICE_UNAVAILABLE (503); null means the token itself is bad.
  const session = await auth.verify(token);
  if (!session) throw fail('UNAUTHENTICATED', INVALID_SESSION);
  // Session tasks (e.g. pending org selection) are not a usable session.
  const sts = session.claims.sts;
  if (sts !== undefined && sts !== 'active') throw fail('UNAUTHENTICATED', INVALID_SESSION);

  const user = await toAuthUser(c, session, fresh);
  c.set('user', user);
  return user;
}

/** Drops the cached Clerk lookup of this user (account-changing routes, webhook). */
export function invalidateUserCache(c: Context<AppBindings>, userId: string): void {
  c.get('deps').userCache.invalidate(userId);
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

/**
 * Like requireSession, but the Clerk user is always read from the Backend API (no cache, no
 * claims shortcut): current ban/lock state and primary e-mail (QA3-01/QA3-03).
 */
export const requireFreshSession: MiddlewareHandler<AppBindings> = async (c, next) => {
  await resolveUser(c, true, true);
  await next();
};

/** Case-insensitive e-mail equality. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/**
 * Keeps `profiles.email_contact` equal to the VERIFIED primary e-mail in Clerk. Clerk only lets
 * a verified address become primary, so a change made in the Clerk account UI is re-synced
 * (audited without PII).
 *
 * QA3-02: when another profile already holds that address (e.g. an orphan left by a Clerk
 * account deleted before the webhook existed) the sync is SKIPPED here — the profile keeps its
 * previous contact, a `warn` without PII is logged and `conflict: true` is returned. `GET /me`
 * flags it (`email_sync_conflict`); organizer actions still answer 409 (assertOrganizer).
 */
export async function syncProfileEmail(
  c: Context<AppBindings>,
  user: AuthUser,
  profile: ProfileRow,
): Promise<{ profile: ProfileRow; conflict: boolean }> {
  if (!user.email || !user.email_confirmed || sameEmail(profile.email_contact, user.email)) {
    return { profile, conflict: false };
  }
  const { repo } = c.get('deps');
  if (await repo.emailInUse(user.email, user.id)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'email_sync_conflict',
        request_id: c.get('requestId'),
      }),
    );
    return { profile, conflict: true };
  }
  const updated = await repo.updateProfile(user.id, { email_contact: user.email });
  await repo.recordAudit({
    actor: user.id,
    action: 'profile.email_changed',
    entity_type: 'profile',
    entity_id: user.id,
    request_id: c.get('requestId'),
  });
  return { profile: updated ?? profile, conflict: false };
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
  // Organizer actions keep refusing while the contact e-mail cannot be synced (unchanged
  // behaviour); only GET /me tolerates the conflict (QA3-02).
  const synced = await syncProfileEmail(c, user, profile);
  if (synced.conflict) throw fail('CONFLICT', 'Este e-mail já está associado a outro cadastro.');
}

export const requireOrganizer: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true);
  if (user) await assertOrganizer(c, user);
  await next();
};

/**
 * Admin = Clerk session with a verified primary e-mail whose Clerk user id is listed in
 * app_private.admins, and whose profile (when there is one) is NOT suspended (QA3-06: a
 * suspended account never acts as admin). MFA is not required (D35). The name is kept for
 * call-site stability.
 */
export async function isAdminWithMfa(c: Context<AppBindings>, user: AuthUser): Promise<boolean> {
  if (!user.email_confirmed) return false;
  const { repo } = c.get('deps');
  if (!(await repo.isAdmin(user.id))) return false;
  const profile = await repo.getProfile(user.id);
  return profile?.account_state !== 'suspended';
}

async function denyAdmin(c: Context<AppBindings>): Promise<never> {
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

export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true);
  if (!user || !(await isAdminWithMfa(c, user))) await denyAdmin(c);
  await next();
};

/**
 * Re-checks the admin against the CURRENT Clerk state (no cache, no claims): used by the
 * contact reveal, the most sensitive admin read (QA3-01/QA3-03). Run after requireAdmin.
 */
export const requireFreshAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await resolveUser(c, true, true);
  if (!user || !(await isAdminWithMfa(c, user))) await denyAdmin(c);
  await next();
};
