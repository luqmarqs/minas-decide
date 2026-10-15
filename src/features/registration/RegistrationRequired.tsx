import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';
import { joinHref, type JoinPrefillState } from './join';

/**
 * D49: signed in, but there is no registration for this e-mail yet. There is ONE registration
 * (home form); after it, the same login becomes an organizer automatically.
 */
export function RegistrationRequired({ email }: { email?: string | null }) {
  const state: JoinPrefillState | undefined = email ? { prefillEmail: email } : undefined;
  return (
    <div className="flex flex-col gap-4">
      <Note>
        Faça seu cadastro primeiro, com o mesmo e-mail que você usou para entrar. Depois disso você
        já pode propor e acompanhar atividades.
      </Note>
      <div>
        <ButtonLink to={joinHref()} state={state}>
          Fazer meu cadastro
        </ButtonLink>
      </div>
    </div>
  );
}
