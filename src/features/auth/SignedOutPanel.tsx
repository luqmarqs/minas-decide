import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';
import { signInHref } from '@/lib/auth';

export interface SignedOutPanelProps {
  /** Internal path to return to after signing in. */
  next: string;
  children: ReactNode;
  /** Show "Criar conta" (false on restricted areas such as /admin). */
  allowSignUp?: boolean;
}

/** Protected pages without a session: "Entrar com código" + "Criar conta". */
export function SignedOutPanel({ next, children, allowSignUp = true }: SignedOutPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <Note>{children}</Note>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={signInHref(next)}>Entrar com código</ButtonLink>
        {allowSignUp ? (
          <ButtonLink to="/participar" variant="secondary">
            Criar conta
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
