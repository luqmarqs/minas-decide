/**
 * Clerk session state without Zod/API code, so the header and the home can know whether
 * someone is signed in without pulling the contracts into the initial chunk (P-PERF-1).
 * See `./auth.ts` for authenticated requests and GET /me.
 */
import { useAuth, useUser } from '@clerk/clerk-react';
import { useMemo } from 'react';
import { isClerkConfigured } from './clerk';

export class AuthUnavailableError extends Error {
  constructor(message = 'O serviço de login não está configurado neste ambiente.') {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

/** Public view of the signed-in person (no token here). */
export interface AuthSession {
  user: {
    id: string;
    email: string | null;
    emailVerified: boolean;
    firstName: string | null;
  };
}

/** Minimal surface of the Clerk instance used outside React (requests, sign-out). */
export interface ClerkHandle {
  readonly session?: {
    getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  } | null;
  readonly user?: {
    id: string;
    firstName?: string | null;
    primaryEmailAddress?: {
      emailAddress: string;
      verification?: { status?: string | null } | null;
    } | null;
  } | null;
  signOut: (opts?: { redirectUrl?: string }) => Promise<unknown>;
}

let clerkRef: ClerkHandle | null = null;

/** Called by the provider bridge (`<ClerkBridge />`) with the live Clerk instance. */
export function registerClerk(clerk: ClerkHandle | null): void {
  clerkRef = clerk;
}

function toAuthSession(clerk: ClerkHandle | null): AuthSession | null {
  const u = clerk?.session ? clerk.user : null;
  if (!u) return null;
  const primary = u.primaryEmailAddress ?? null;
  return {
    user: {
      id: u.id,
      email: primary?.emailAddress ?? null,
      emailVerified: primary?.verification?.status === 'verified',
      firstName: u.firstName ?? null,
    },
  };
}

/** Current session outside React (null when signed out, not loaded or not configured). */
export async function getCurrentSession(): Promise<AuthSession | null> {
  return toAuthSession(clerkRef);
}

/** Fresh Clerk session token (null when there is no session). */
export async function getSessionToken(opts?: { skipCache?: boolean }): Promise<string | null> {
  const session = clerkRef?.session;
  if (!session) return null;
  try {
    return await session.getToken(opts);
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  // QA2-11: drafts may hold address/contact; never leave them behind on shared devices.
  const { clearAllDrafts } = await import('@/features/activities/draftStore');
  clearAllDrafts();
  if (!clerkRef) return;
  await clerkRef.signOut({ redirectUrl: '/' });
}

export type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'none'; session: null }
  | { status: 'unconfigured'; session: null }
  | { status: 'active'; session: AuthSession };

const LOADING: SessionState = { status: 'loading', session: null };
const NONE: SessionState = { status: 'none', session: null };
const UNCONFIGURED: SessionState = { status: 'unconfigured', session: null };

function useClerkSession(): SessionState {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const emailVerified = user?.primaryEmailAddress?.verification?.status === 'verified';
  const firstName = user?.firstName ?? null;
  return useMemo<SessionState>(() => {
    if (!isLoaded) return LOADING;
    if (!isSignedIn || !userId) return NONE;
    return { status: 'active', session: { user: { id: userId, email, emailVerified, firstName } } };
  }, [isLoaded, isSignedIn, userId, email, emailVerified, firstName]);
}

function useUnconfiguredSession(): SessionState {
  return UNCONFIGURED;
}

/**
 * Reactive session state. Chosen once per build: without a publishable key there is no
 * `<ClerkProvider>` and the UI shows the "login não configurado" states.
 */
export const useSession: () => SessionState = isClerkConfigured()
  ? useClerkSession
  : useUnconfiguredSession;
