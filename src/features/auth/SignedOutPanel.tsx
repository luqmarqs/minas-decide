import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';
import { signInHref } from '@/lib/auth';
import { joinHref } from '@/features/registration/join';

export interface SignedOutPanelProps {
  /** Internal path to return to after signing in. */
  next: string;
  children: ReactNode;
  /** Show "Fazer cadastro" (home form, D49; false on restricted areas such as /admin). */
  allowSignUp?: boolean;
}

/** Protected pages without a session: "Entrar com código" + "Fazer cadastro" (home form). */
export function SignedOutPanel({ next, children, allowSignUp = true }: SignedOutPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <Note>{children}</Note>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={signInHref(next)}>Entrar com código</ButtonLink>
        {allowSignUp ? (
          <ButtonLink to={joinHref()} variant="secondary">
            Fazer cadastro
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
