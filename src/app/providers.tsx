import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createElement, useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { isClerkConfigured } from '@/lib/clerk';
import { whenIdle } from '@/lib/idle';
import { hasSessionHint, requestClerk, useClerkRoot } from '@/lib/session';
import { createQueryClient } from './queryClient';

function fullPageNavigate(to: string, opts?: { replace?: boolean }) {
  if (opts?.replace) window.location.replace(to);
  else window.location.assign(to);
}

/** Routes that need the session at once (their pages also request Clerk themselves). */
const SESSION_ROUTES =
  /^\/(?:entrar|participar|criar-atividade|minhas-atividades|propor-grupo|conta|admin)(?:\/|$)/;

/**
 * FE-12: Clerk loads right away on session routes or with a previous-session hint;
 * everywhere else (home, territory, activity…) only once the page is idle, so the first
 * paint never waits for `@clerk/clerk-react` nor for clerk-js.
 */
function useClerkLoading() {
  useEffect(() => {
    if (!isClerkConfigured()) return;
    if (SESSION_ROUTES.test(window.location.pathname) || hasSessionHint()) {
      requestClerk();
      return;
    }
    return whenIdle(requestClerk, { timeout: 4000 });
  }, []);
}

/**
 * Mounts the lazy Clerk root once requested. Its component identity is stable (one module
 * export kept by the session store), so it never remounts; `createElement` because the
 * component comes from the store, not from a static import.
 */
function ClerkSlot({ navigate }: { navigate: (to: string, opts?: { replace?: boolean }) => void }) {
  const root = useClerkRoot();
  return root ? createElement(root, { navigate }) : null;
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
  useClerkLoading();
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
      {/* Sibling, not a wrapper: mounting Clerk later never remounts the page. */}
      <ClerkSlot navigate={navigate ?? fullPageNavigate} />
    </>
  );
}
