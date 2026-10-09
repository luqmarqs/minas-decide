/**
 * Clerk (ADR 0005) in its own lazy chunk (FE-12): `ClerkProvider` + a bridge that publishes
 * the session and the sign-in/sign-up resources to `src/lib/session.ts`. Mounted by
 * `Providers` next to the app (not around it) only when something requests Clerk, so the
 * home's first paint never waits for `@clerk/clerk-react` nor for clerk-js.
 */
import {
  ClerkProvider,
  useAuth,
  useClerk,
  useSignIn,
  useSignUp,
  useUser,
} from '@clerk/clerk-react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  clerkAppearance,
  clerkPtBR,
  clerkPublishableKey,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from '@/lib/clerk';
import {
  publishClerk,
  type ClerkHandle,
  type ClerkRootProps,
  type SessionState,
} from '@/lib/session';

const LOADING: SessionState = { status: 'loading', session: null };
const NONE: SessionState = { status: 'none', session: null };

/** Hands the live Clerk instance and session state to non-Clerk code. */
function ClerkBridge() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const signInHook = useSignIn();
  const signUpHook = useSignUp();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const emailVerified = user?.primaryEmailAddress?.verification?.status === 'verified';
  const firstName = user?.firstName ?? null;
  const state = useMemo<SessionState>(() => {
    if (!isLoaded) return LOADING;
    if (!isSignedIn || !userId) return NONE;
    return { status: 'active', session: { user: { id: userId, email, emailVerified, firstName } } };
  }, [isLoaded, isSignedIn, userId, email, emailVerified, firstName]);
  const signIn = signInHook.isLoaded ? signInHook.signIn : null;
  const signUp = signUpHook.isLoaded ? signUpHook.signUp : null;
  const setActive = signInHook.isLoaded ? signInHook.setActive : null;

  // Layout effect: subscribers re-render before paint (no "Entrar" flash once loaded).
  useLayoutEffect(() => {
    publishClerk(
      { loaded: !!isLoaded, state, signIn, signUp, setActive },
      clerk as unknown as ClerkHandle,
    );
  }, [clerk, isLoaded, state, signIn, signUp, setActive]);
  useEffect(() => () => publishClerk(null, null), []);
  return null;
}

/** `ClerkProvider` with the app's options (headless clerk-js, no telemetry, PT-BR). */
export default function ClerkRoot({ navigate }: ClerkRootProps) {
  const [appearance] = useState(() => clerkAppearance());
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey()}
      afterSignOutUrl="/"
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      localization={clerkPtBR}
      appearance={appearance}
      telemetry={false}
      // Custom flows only (no Clerk UI components): the headless build skips the UI bundles.
      clerkJSVariant="headless"
      routerPush={(to: string) => navigate(to)}
      routerReplace={(to: string) => navigate(to, { replace: true })}
    >
      <ClerkBridge />
    </ClerkProvider>
  );
}
