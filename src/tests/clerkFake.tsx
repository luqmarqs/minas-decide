/**
 * In-memory fake of `@clerk/clerk-react` for unit tests (installed globally in setup.ts).
 * No network: sign-up/sign-in by e-mail code are simulated; `clerk.validCode` passes,
 * anything else fails with Clerk's `form_code_incorrect`. Emails in `clerk.existing`
 * already have an account (`form_identifier_exists` on sign-up).
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { vi } from 'vitest';

export const CLERK_USER_ID = 'user_2testFakeClerkId0001';
export const CLERK_TOKEN = 'clerk-session-token-test-0123456789';

export interface FakeUser {
  id: string;
  email: string;
  firstName: string | null;
}

/** Shape of a Clerk API error (`isClerkAPIResponseError` duck type). */
export function clerkApiError(code: string, paramName?: string) {
  return Object.assign(new Error(code), {
    clerkError: true,
    status: 422,
    errors: [{ code, message: code, longMessage: code, meta: paramName ? { paramName } : {} }],
  });
}

const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const useVersion = () => useSyncExternalStore(subscribe, () => version);

interface State {
  loaded: boolean;
  user: FakeUser | null;
  pending: FakeUser | null;
  signUp: { email: string; firstName: string | null } | null;
  signInEmail: string | null;
}

const state: State = { loaded: true, user: null, pending: null, signUp: null, signInEmail: null };

function userView(u: FakeUser | null) {
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.firstName,
    primaryEmailAddress: { emailAddress: u.email, verification: { status: 'verified' } },
  };
}

const fns = {
  signUpCreate: vi.fn(async (params: { emailAddress: string; firstName?: string }) => {
    if (clerk.existing.has(params.emailAddress)) throw clerkApiError('form_identifier_exists');
    state.signUp = { email: params.emailAddress, firstName: params.firstName ?? null };
    return signUp;
  }),
  prepareEmailAddressVerification: vi.fn(async (_p: { strategy: string }) => signUp),
  attemptEmailAddressVerification: vi.fn(async ({ code }: { code: string }) => {
    if (code !== clerk.validCode) throw clerkApiError('form_code_incorrect');
    if (!state.signUp) throw clerkApiError('verification_failed');
    state.pending = {
      id: CLERK_USER_ID,
      email: state.signUp.email,
      firstName: state.signUp.firstName,
    };
    return { status: 'complete', createdSessionId: 'sess_test_1' };
  }),
  signInCreate: vi.fn(async ({ identifier }: { identifier: string }) => {
    if (!clerk.existing.has(identifier)) throw clerkApiError('form_identifier_not_found');
    state.signInEmail = identifier;
    return {
      ...signIn,
      supportedFirstFactors: [
        { strategy: 'email_code', emailAddressId: 'idn_test_1', safeIdentifier: identifier },
      ],
    };
  }),
  prepareFirstFactor: vi.fn(async (_p: { strategy: string; emailAddressId: string }) => signIn),
  attemptFirstFactor: vi.fn(async ({ code }: { code: string }) => {
    if (code !== clerk.validCode) throw clerkApiError('form_code_incorrect');
    state.pending = { id: CLERK_USER_ID, email: state.signInEmail ?? '', firstName: 'Maria' };
    return { status: 'complete', createdSessionId: 'sess_test_2' };
  }),
  setActive: vi.fn(async (_p: { session: string | null }) => {
    state.user = state.pending;
    emit();
  }),
  getToken: vi.fn(async (_o?: { skipCache?: boolean }) => (state.user ? CLERK_TOKEN : null)),
  signOut: vi.fn(async (_o?: { redirectUrl?: string }) => {
    state.user = null;
    emit();
  }),
};

const signUp = {
  create: fns.signUpCreate,
  prepareEmailAddressVerification: fns.prepareEmailAddressVerification,
  attemptEmailAddressVerification: fns.attemptEmailAddressVerification,
};
const signIn = {
  create: fns.signInCreate,
  prepareFirstFactor: fns.prepareFirstFactor,
  attemptFirstFactor: fns.attemptFirstFactor,
};

/** Stable instance (as `useClerk()` returns): getters read the live state. */
const instance = {
  get loaded() {
    return state.loaded;
  },
  get session() {
    return state.user ? { id: 'sess_test', getToken: fns.getToken } : null;
  },
  get user() {
    return userView(state.user);
  },
  signOut: fns.signOut,
};

/** Test control surface. */
export const clerk = {
  fns,
  existing: new Set<string>(),
  validCode: '424242',
  /** Signs a verified user in (as if a session already existed in this browser). */
  signIn(user: Partial<FakeUser> = {}) {
    state.user = {
      id: user.id ?? CLERK_USER_ID,
      email: user.email ?? 'maria@exemplo.com.br',
      firstName: user.firstName === undefined ? 'Maria' : user.firstName,
    };
    emit();
  },
  signOut() {
    state.user = null;
    emit();
  },
  setLoaded(loaded: boolean) {
    state.loaded = loaded;
    emit();
  },
  get user() {
    return state.user;
  },
  reset() {
    state.loaded = true;
    state.user = null;
    state.pending = null;
    state.signUp = null;
    state.signInEmail = null;
    clerk.existing.clear();
    clerk.validCode = '424242';
    Object.values(fns).forEach((f) => f.mockClear());
    emit();
  },
};

export const clerkReactMock = {
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useClerk: () => {
    useVersion();
    return instance;
  },
  useAuth: () => {
    useVersion();
    return {
      isLoaded: state.loaded,
      isSignedIn: state.loaded ? !!state.user : undefined,
      userId: state.user?.id ?? null,
      getToken: fns.getToken,
      signOut: fns.signOut,
    };
  },
  useUser: () => {
    useVersion();
    return {
      isLoaded: state.loaded,
      isSignedIn: state.loaded ? !!state.user : undefined,
      user: userView(state.user),
    };
  },
  useSignUp: () => {
    useVersion();
    return { isLoaded: state.loaded, signUp, setActive: fns.setActive };
  },
  useSignIn: () => {
    useVersion();
    return { isLoaded: state.loaded, signIn, setActive: fns.setActive };
  },
};
