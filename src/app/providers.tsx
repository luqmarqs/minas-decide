import { ClerkProvider, useClerk } from '@clerk/clerk-react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { registerClerk, type ClerkHandle } from '@/lib/session';
import {
  clerkAppearance,
  clerkPtBR,
  clerkPublishableKey,
  isClerkConfigured,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from '@/lib/clerk';
import { createQueryClient } from './queryClient';

/** Hands the live Clerk instance to non-React code (API requests, sign-out). */
function ClerkBridge() {
  const clerk = useClerk();
  useEffect(() => {
    registerClerk(clerk as unknown as ClerkHandle);
    return () => registerClerk(null);
  }, [clerk]);
  return null;
}

function fullPageNavigate(to: string, opts?: { replace?: boolean }) {
  if (opts?.replace) window.location.replace(to);
  else window.location.assign(to);
}

export interface ProvidersProps {
  children: ReactNode;
  client?: QueryClient;
  /** SPA navigation for Clerk redirects (sign-out); defaults to full page loads. */
  navigate?: (to: string, opts?: { replace?: boolean }) => void;
}

/** App-wide providers. (Reduced motion is handled by duration tokens in tokens.css.) */
export function Providers({ children, client, navigate }: ProvidersProps) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  const [appearance] = useState(() => clerkAppearance());
  const go = navigate ?? fullPageNavigate;
  const inner = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  if (!isClerkConfigured()) return inner;
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
      routerPush={(to: string) => go(to)}
      routerReplace={(to: string) => go(to, { replace: true })}
    >
      <ClerkBridge />
      {inner}
    </ClerkProvider>
  );
}
