import { lazy, Suspense } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { useSessionMaybePresent } from '@/lib/sessionPresence';

const SessionMenuActive = lazy(() =>
  import('./SessionMenuActive').then((m) => ({ default: m.SessionMenuActive })),
);

function ParticiparCta() {
  return (
    <ButtonLink to="/participar" size="sm">
      Participar
    </ButtonLink>
  );
}

/**
 * Header slot. Visitors without any stored session get the plain "Participar"
 * CTA and never download supabase-js/Zod; the real menu (session state, account
 * links) is a lazy chunk loaded only when a session may exist.
 */
export function SessionMenu() {
  const maybe = useSessionMaybePresent();
  if (!maybe) return <ParticiparCta />;
  return (
    <Suspense fallback={<ParticiparCta />}>
      <SessionMenuActive fallback={<ParticiparCta />} />
    </Suspense>
  );
}
