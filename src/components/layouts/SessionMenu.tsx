import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { JoinCta } from '@/features/registration/JoinCta';
import { useSession } from '@/lib/session';

const SessionMenuActive = lazy(() =>
  import('./SessionMenuActive').then((m) => ({ default: m.SessionMenuActive })),
);

/**
 * "Entrar" (from 640px; on phones the header has no room — /entrar is linked from the
 * sign-up form and protected pages) + "Participar" (home: scrolls to #participar).
 */
function SignedOutActions() {
  return (
    <div className="flex items-center gap-1">
      <Link
        to="/entrar"
        className="hidden min-h-11 items-center rounded-md px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline sm:inline-flex"
      >
        Entrar
      </Link>
      <JoinCta size="sm">Participar</JoinCta>
    </div>
  );
}

/**
 * Header slot (ADR 0005). Signed out: "Entrar" + "Participar". Signed in: the account menu
 * (lazy chunk: GET /me and the contracts load only for people with a session).
 */
export function SessionMenu() {
  // FE-12: the header never loads Clerk by itself (idle/session routes/hint do).
  const session = useSession({ lazy: true });
  if (session.status !== 'active') return <SignedOutActions />;
  return (
    <Suspense fallback={<SignedOutActions />}>
      <SessionMenuActive session={session.session} />
    </Suspense>
  );
}
