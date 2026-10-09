/**
 * Clerk session state without Zod/API code and without `@clerk/clerk-react` (FE-12): the
 * header and the home know whether someone is signed in without pulling Clerk into the
 * initial chunk. Clerk itself (`ClerkProvider` + bridge, `src/app/ClerkRoot.tsx`) is a
 * lazy chunk, mounted next to the app (never wrapping it, so loading it never remounts the
 * page) as soon as something asks for it:
 *  - pages that need a session (`useSession()` default, sign-in/sign-up flows);
 *  - a hint of a previous session in this browser (Clerk's `__client_uat` cookie or our
 *    `md.session-hint` flag: a boolean, never a token);
 *  - otherwise only after the page is idle (see `Providers`).
 * See `./auth.ts` for authenticated requests and GET /me.
 */
import type { useSignIn, useSignUp } from '@clerk/clerk-react';
import { useEffect, useSyncExternalStore, type ComponentType } from 'react';
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

export type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'none'; session: null }
  | { status: 'unconfigured'; session: null }
  | { status: 'active'; session: AuthSession };

const LOADING: SessionState = { status: 'loading', session: null };
const NONE: SessionState = { status: 'none', session: null };
const UNCONFIGURED: SessionState = { status: 'unconfigured', session: null };

type SignInHook = ReturnType<typeof useSignIn>;
type SignUpHook = ReturnType<typeof useSignUp>;
export type ClerkSignIn = NonNullable<SignInHook['signIn']>;
export type ClerkSignUp = NonNullable<SignUpHook['signUp']>;
export type ClerkSetActive = NonNullable<SignInHook['setActive']>;

/** What the bridge inside `ClerkRoot` publishes on every Clerk change. */
export interface ClerkSnapshot {
  /** Clerk finished loading (`useAuth().isLoaded`). */
  loaded: boolean;
  state: SessionState;
  signIn: ClerkSignIn | null;
  signUp: ClerkSignUp | null;
  setActive: ClerkSetActive | null;
}

/** Props of the lazy Clerk root (`src/app/ClerkRoot.tsx`). */
export interface ClerkRootProps {
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

// ---------------------------------------------------------------------------------------
// Store (module level; one Clerk per page)
// ---------------------------------------------------------------------------------------

interface Store {
  requested: boolean;
  root: ComponentType<ClerkRootProps> | null;
  clerk: ClerkSnapshot | null;
}

let store: Store = { requested: false, root: null, clerk: null };
let clerkRef: ClerkHandle | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const readyWaiters = new Set<() => void>();

function setStore(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
  if (store.clerk?.loaded && readyWaiters.size) {
    const waiters = [...readyWaiters];
    readyWaiters.clear();
    waiters.forEach((w) => w());
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getStore = () => store;

/** Imports the Clerk chunk once (no request to Clerk yet: that starts when it mounts). */
export function loadClerkRoot(): Promise<void> {
  loading ??= import('@/app/ClerkRoot').then(
    (m) => setStore({ root: m.default }),
    (err: unknown) => {
      loading = null; // a later request may retry (offline, deploy in between)
      throw err;
    },
  );
  return loading;
}

/** Asks for Clerk (idempotent). Safe to call from effects and event handlers. */
export function requestClerk(): void {
  if (!isClerkConfigured()) return;
  if (!store.requested) setStore({ requested: true });
  loadClerkRoot().catch(() => {
    /* chunk failed: session stays "loading"/"none"; flows report not_loaded */
  });
}

/** The Clerk root to mount next to the app (null until requested and its chunk loaded). */
export function useClerkRoot(): ComponentType<ClerkRootProps> | null {
  const s = useSyncExternalStore(subscribe, getStore, getStore);
  return s.requested ? s.root : null;
}

/** Called by the bridge inside `ClerkRoot` (null on unmount). */
export function publishClerk(snapshot: ClerkSnapshot | null, handle: ClerkHandle | null): void {
  clerkRef = handle;
  if (snapshot?.loaded) writeSessionHint(snapshot.state.status === 'active');
  setStore({ clerk: snapshot });
}

/** Test-only: forget that Clerk was requested (the loaded chunk stays cached). */
export function resetClerkRequestForTests(): void {
  clerkRef = null;
  readyWaiters.clear();
  setStore({ requested: false, clerk: null });
}

// ---------------------------------------------------------------------------------------
// Previous-session hint (boolean only; never a token)
// ---------------------------------------------------------------------------------------

export const SESSION_HINT_KEY = 'md.session-hint';

function writeSessionHint(active: boolean) {
  try {
    if (active) window.localStorage.setItem(SESSION_HINT_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* storage blocked: the cookie (or the idle load) still covers it */
  }
}

/**
 * `true` when this browser probably has a Clerk session: our flag (set while a session is
 * active) or Clerk's `__client_uat` cookie (time of the last sign-in, `0` when signed out).
 * Only decides how early Clerk loads and whether the UI waits ("loading") for it.
 */
export function hasSessionHint(): boolean {
  try {
    if (window.localStorage.getItem(SESSION_HINT_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const m = /(?:^|;\s*)__client_uat(?:_[^=;]*)?=([^;]*)/.exec(document.cookie);
    return !!m && m[1] !== '' && m[1] !== '0';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------
// Non-React helpers (requests, sign-out, flows)
// ---------------------------------------------------------------------------------------

/** Hands a Clerk instance to non-React code (the bridge does it through `publishClerk`). */
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
  writeSessionHint(false);
  if (!clerkRef) return;
  await clerkRef.signOut({ redirectUrl: '/' });
}

/** Current Clerk resources (sign-in/sign-up), or null while Clerk is not loaded. */
export function getClerkSnapshot(): ClerkSnapshot | null {
  return store.clerk?.loaded ? store.clerk : null;
}

/**
 * Requests Clerk and resolves once it is loaded (a flow submitted before the chunk or
 * clerk-js arrived). Rejects after `timeoutMs` so the form shows an error instead of
 * waiting forever.
 */
export function whenClerkReady(timeoutMs = 20000): Promise<ClerkSnapshot> {
  requestClerk();
  const now = getClerkSnapshot();
  if (now) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      const snap = getClerkSnapshot();
      if (snap) resolve(snap);
      else reject(new Error('clerk_not_loaded'));
    };
    const timer = setTimeout(() => {
      readyWaiters.delete(done);
      reject(new Error('clerk_not_loaded'));
    }, timeoutMs);
    readyWaiters.add(done);
  });
}

// ---------------------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------------------

export interface UseSessionOptions {
  /**
   * `true` for surfaces that must not load Clerk by themselves (header menu, home sign-up
   * section): until Clerk is loaded they report "none" (or "loading" when there is a
   * previous-session hint). Default (`false`): the page needs the session, so Clerk is
   * requested right away and the state is "loading" until it answers.
   */
  lazy?: boolean;
}

/** Clerk resources for custom flows (null until loaded); requests Clerk unless `lazy`. */
export function useClerkSnapshot({ lazy = false }: UseSessionOptions = {}): ClerkSnapshot | null {
  const s = useSyncExternalStore(subscribe, getStore, getStore);
  useEffect(() => {
    if (!lazy) requestClerk();
  }, [lazy]);
  return s.clerk?.loaded ? s.clerk : null;
}

function useClerkSession({ lazy = false }: UseSessionOptions = {}): SessionState {
  const s = useSyncExternalStore(subscribe, getStore, getStore);
  useEffect(() => {
    if (!lazy) requestClerk();
  }, [lazy]);
  if (s.clerk?.loaded) return s.clerk.state;
  return !lazy || hasSessionHint() ? LOADING : NONE;
}

/**
 * Reactive session state. Without a publishable key (fixed per build) there is no Clerk
 * at all and the UI shows the "login não configurado" states. Checked per call (same
 * hooks either way), so importing this module never freezes the configuration.
 */
export function useSession(opts?: UseSessionOptions): SessionState {
  const state = useClerkSession(opts);
  return isClerkConfigured() ? state : UNCONFIGURED;
}
