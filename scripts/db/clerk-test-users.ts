/**
 * Throw-away Clerk users + REAL session tokens for live tests and smoke runs (ADR 0005).
 * Development instance only (`sk_test_…`); e-mails are `qa-clerk-<tag>@example.org`-style and
 * every user is removed with `deleteClerkTestUser` (DB rows via `svc_erase_user_data`, then the
 * Clerk user). Never prints tokens, ids or e-mails.
 *
 * Observed behaviour of the dev instance (BE-5, 2026-10-09, @clerk/backend 3.23.1):
 *   - `users.createUser({ emailAddress, skipPasswordRequirement: true })` creates the user with
 *     its primary e-mail already `verified`;
 *   - `sessions.createSession({ userId })` returns an `active` session and
 *     `sessions.getToken(sessionId)` a session JWT valid for 60 s with claims
 *     exp, fva, iat, iss, nbf, sid, sts, sub, v (no `azp`, no e-mail claims);
 *   - an UNVERIFIED primary e-mail is impossible in this instance: createEmailAddress with
 *     `verified: false, primary: true` answers 400 `breaks_instance_invariant` ("You can't set
 *     an unverified email address as a user's primary email address"), so the 403
 *     EMAIL_NOT_VERIFIED path is covered only by the Worker unit tests (fake gateway).
 */
import { createClerkClient } from '@clerk/backend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './load-env.ts';

export type Clerk = ReturnType<typeof createClerkClient>;

export function devClerk(): Clerk {
  const secretKey = requireEnv('CLERK_SECRET_KEY');
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Refusing: live tests need a development Clerk key (sk_test_).');
  }
  return createClerkClient({ secretKey });
}

export interface ClerkTestUser {
  id: string;
  email: string;
  /** fresh session token (re-minted when older than 40 s; Clerk tokens live 60 s) */
  token(): Promise<string>;
}

export async function createClerkTestUser(clerk: Clerk, email: string): Promise<ClerkTestUser> {
  const user = await clerk.users.createUser({
    emailAddress: [email],
    skipPasswordRequirement: true,
  });
  const session = await clerk.sessions.createSession({ userId: user.id });
  let cached: { jwt: string; at: number } | null = null;
  return {
    id: user.id,
    email,
    async token() {
      if (cached && Date.now() - cached.at < 40_000) return cached.jwt;
      const t = await clerk.sessions.getToken(session.id);
      cached = { jwt: t.jwt, at: Date.now() };
      return t.jwt;
    },
  };
}

/** Erases the user's operational rows (RSVPs, activities, profile, admin) and the Clerk user. */
export async function deleteClerkTestUser(
  clerk: Clerk,
  svc: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await svc.rpc('svc_erase_user_data', {
    p_user: id,
    p_request_id: 'live-test-cleanup',
  });
  if (error) throw new Error(`svc_erase_user_data failed (${error.code ?? 'unknown'})`);
  try {
    await clerk.users.deleteUser(id);
  } catch {
    // already deleted
  }
}
