/**
 * Clerk adapter (ADR 0005). Identity = Clerk; Supabase is only the database.
 *
 * - `verify`: `verifyToken` from @clerk/backend — RS256 signature against the instance JWKS
 *   (fetched with the secret key and cached in memory by the SDK for the isolate's lifetime;
 *   or, when CLERK_JWT_KEY holds the instance PEM public key, verified without any network
 *   call), `exp`/`nbf` with clock skew; then `azp` must be one of our origins (an absent `azp`
 *   is tolerated only in local/test — see azpAllowed).
 * - `getUser`: Backend API `users.getUser` — used when the session token carries no
 *   `email`/`email_verified` claims (the default Clerk session token does not; observed in the
 *   dev instance: exp, fva, iat, iss, nbf, sid, sts, sub, v). Costs one HTTPS call to Clerk per
 *   authenticated request (~0.2–0.5 s measured from a dev machine); the result lives only in
 *   the request context.
 * - `findUserByEmail`: Backend API `users.getUserList({ emailAddress })` (scripts).
 * Errors other than "not found" fail closed (AppError INTERNAL_ERROR); nothing from Clerk is
 * forwarded to the client and tokens are never logged.
 */
import { createClerkClient, verifyToken } from '@clerk/backend';
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

export function toUserInfo(u: ClerkUser): ClerkUserInfo {
  const primary =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0] ?? null;
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

export class ClerkAuthGateway implements AuthGateway {
  private clientInstance: ClerkClient | null = null;

  constructor(private readonly env: Env) {}

  private client(): ClerkClient {
    this.clientInstance ??= createClerkClient({ secretKey: this.env.CLERK_SECRET_KEY });
    return this.clientInstance;
  }

  async verify(token: string): Promise<VerifiedSession | null> {
    try {
      const payload = (await verifyToken(token, {
        secretKey: this.env.CLERK_SECRET_KEY,
        ...(this.env.CLERK_JWT_KEY ? { jwtKey: this.env.CLERK_JWT_KEY } : {}),
        clockSkewInMs: this.env.APP_ENV === 'local' ? CLOCK_SKEW_MS_LOCAL : CLOCK_SKEW_MS_DEFAULT,
      })) as unknown as Record<string, unknown>;
      const sub = payload.sub;
      if (typeof sub !== 'string' || !sub.startsWith('user_')) return null;
      if (!azpAllowed(this.env, payload.azp)) return null;
      return { sub, claims: payload };
    } catch {
      return null;
    }
  }

  async getUser(userId: string): Promise<ClerkUserInfo | null> {
    try {
      return toUserInfo(await this.client().users.getUser(userId));
    } catch (e) {
      if (status(e) === 404) return null;
      console.error(
        JSON.stringify({ level: 'error', where: 'clerk.getUser', status: status(e) ?? 'unknown' }),
      );
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
