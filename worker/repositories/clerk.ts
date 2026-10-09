/**
 * Clerk adapter (ADR 0005). Identity = Clerk; Supabase is only the database.
 *
 * - `verify`: `verifyToken` from @clerk/backend — RS256 signature against the instance JWKS
 *   (fetched with the secret key and cached in memory by the SDK for the isolate's lifetime;
 *   or, when CLERK_JWT_KEY holds the instance PEM public key, verified without any network
 *   call), `exp`/`nbf` with clock skew; then (QA3-04) `iss` must be the instance Frontend API
 *   (see expectedIssuer), `sub` must match the `ClerkUserId` contract and `azp` must be one of
 *   our origins (an absent `azp` is tolerated only in local/test — see azpAllowed).
 *   QA3-05: an invalid token returns null (-> 401); a JWKS/network/configuration failure throws
 *   AppError SERVICE_UNAVAILABLE (-> 503) instead of telling everyone to sign in again.
 * - `getUser`: Backend API `users.getUser` — used when the session token carries no
 *   `email`/`email_verified` claims (the default Clerk session token does not; observed in the
 *   dev instance: exp, fva, iat, iss, nbf, sid, sts, sub, v). ~0.2–0.5 s per call; results are
 *   cached per isolate for 60 s by the auth middleware (QA3-01, services/user-cache.ts).
 *   404 -> null; 429, 5xx or no response -> SERVICE_UNAVAILABLE (503); anything else (e.g. a
 *   rejected secret key) -> INTERNAL_ERROR.
 * - `findUserByEmail`: Backend API `users.getUserList({ emailAddress })` (scripts).
 * Nothing from Clerk is forwarded to the client and tokens are never logged.
 */
import { createClerkClient, verifyToken } from '@clerk/backend';
import { TokenVerificationErrorReason } from '@clerk/backend/errors';
import { ClerkUserId } from '../../shared/contracts/registration.ts';
import type { Env } from '../env.ts';
import { fail } from '../errors.ts';
import type { AuthGateway, ClerkUserInfo, VerifiedSession } from './types.ts';

type ClerkClient = ReturnType<typeof createClerkClient>;
type ClerkUser = Awaited<ReturnType<ClerkClient['users']['getUser']>>;

/** Local dev machines drift (observed ~33 s behind on the dev box); Workers do not. */
const CLOCK_SKEW_MS_LOCAL = 60_000;
const CLOCK_SKEW_MS_DEFAULT = 5_000;

export function allowedParties(env: Env): string[] {
  return [env.PUBLIC_ORIGIN, ...(env.ALLOWED_ORIGINS ?? '').split(',')]
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Expected `iss` of session tokens = the instance Frontend API, `https://<host>` (QA3-04).
 * CLERK_ISSUER wins when set; otherwise the host is decoded from the publishable key
 * (`pk_test_|pk_live_` + base64(`<host>$`)). null when neither is configured/decodable.
 */
export function expectedIssuer(env: Env): string | null {
  const explicit = env.CLERK_ISSUER?.trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  return issuerFromPublishableKey(env.CLERK_PUBLISHABLE_KEY);
}

export function issuerFromPublishableKey(pk: string | undefined): string | null {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(pk?.trim() ?? '');
  if (!m?.[2]) return null;
  let decoded: string;
  try {
    decoded = atob(m[2].replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  if (!decoded.endsWith('$')) return null;
  const host = decoded.slice(0, -1).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  return `https://${host}`;
}

/** The issuer may be left unconfigured only in local/test (staging/production fail closed). */
export function issuerAllowed(env: Env, iss: unknown): boolean {
  const expected = expectedIssuer(env);
  if (!expected) return env.APP_ENV === 'local' || env.APP_ENV === 'test';
  return typeof iss === 'string' && iss === expected;
}

/** QA3-11: only the PRIMARY address counts; no primary -> e-mail null (never the first one). */
export function toUserInfo(u: ClerkUser): ClerkUserInfo {
  const primary = u.primaryEmailAddressId
    ? (u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? null)
    : null;
  return {
    id: u.id,
    email: primary ? primary.emailAddress.toLowerCase() : null,
    email_verified: primary?.verification?.status === 'verified',
    banned: Boolean(u.banned || u.locked),
  };
}

/**
 * `azp` (the frontend origin that obtained the token) must be one of our origins. Browser
 * session tokens always carry it; tokens minted through the Backend API (secret key, used only
 * by the live tests) do not, and are accepted without `azp` only in local/test.
 */
export function azpAllowed(env: Env, azp: unknown): boolean {
  if (azp === undefined || azp === null || azp === '') {
    return env.APP_ENV === 'local' || env.APP_ENV === 'test';
  }
  return typeof azp === 'string' && allowedParties(env).includes(azp.replace(/\/+$/, ''));
}

function status(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
}

/** Reasons that mean "we could not check the token", not "the token is bad" (QA3-05). */
const OUTAGE_REASONS = new Set<string>([
  TokenVerificationErrorReason.RemoteJWKFailedToLoad,
  TokenVerificationErrorReason.RemoteJWKInvalid,
  TokenVerificationErrorReason.RemoteJWKMissing,
  TokenVerificationErrorReason.JWKFailedToResolve,
  TokenVerificationErrorReason.LocalJWKMissing,
  TokenVerificationErrorReason.InvalidSecretKey,
]);

/**
 * `verifyToken` throws a TokenVerificationError (string `reason`) for every token problem;
 * anything else (fetch TypeError, DNS, timeouts) is an infrastructure failure.
 */
export function isVerificationOutage(e: unknown): boolean {
  const reason = (e as { reason?: unknown } | null)?.reason;
  if (typeof reason !== 'string') return true;
  return OUTAGE_REASONS.has(reason);
}

function logClerk(where: string, detail: string | number): void {
  console.error(JSON.stringify({ level: 'error', where, detail }));
}

export class ClerkAuthGateway implements AuthGateway {
  private clientInstance: ClerkClient | null = null;

  constructor(private readonly env: Env) {}

  private client(): ClerkClient {
    this.clientInstance ??= createClerkClient({ secretKey: this.env.CLERK_SECRET_KEY });
    return this.clientInstance;
  }

  async verify(token: string): Promise<VerifiedSession | null> {
    let payload: Record<string, unknown>;
    try {
      payload = (await verifyToken(token, {
        secretKey: this.env.CLERK_SECRET_KEY,
        ...(this.env.CLERK_JWT_KEY ? { jwtKey: this.env.CLERK_JWT_KEY } : {}),
        clockSkewInMs: this.env.APP_ENV === 'local' ? CLOCK_SKEW_MS_LOCAL : CLOCK_SKEW_MS_DEFAULT,
      })) as unknown as Record<string, unknown>;
    } catch (e) {
      if (!isVerificationOutage(e)) return null;
      const reason = (e as { reason?: unknown } | null)?.reason;
      logClerk('clerk.verify', typeof reason === 'string' ? reason : 'network');
      throw fail('SERVICE_UNAVAILABLE');
    }
    const sub = payload.sub;
    if (typeof sub !== 'string' || !ClerkUserId.safeParse(sub).success) return null;
    if (!issuerAllowed(this.env, payload.iss)) return null;
    if (!azpAllowed(this.env, payload.azp)) return null;
    return { sub, claims: payload };
  }

  async getUser(userId: string): Promise<ClerkUserInfo | null> {
    try {
      return toUserInfo(await this.client().users.getUser(userId));
    } catch (e) {
      const s = status(e);
      if (s === 404) return null;
      logClerk('clerk.getUser', s ?? 'network');
      // QA3-01/05: throttling (429), Clerk outage (5xx) or no response -> 503, never 500.
      if (s === null || s === 429 || s >= 500) throw fail('SERVICE_UNAVAILABLE');
      throw fail('INTERNAL_ERROR');
    }
  }

  async findUserByEmail(email: string): Promise<ClerkUserInfo | null> {
    const list = await this.client().users.getUserList({
      emailAddress: [email.trim().toLowerCase()],
      limit: 2,
    });
    const hit = list.data[0];
    return hit ? toUserInfo(hit) : null;
  }
}
