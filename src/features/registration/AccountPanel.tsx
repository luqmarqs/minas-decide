import { useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { useMe, useSession } from '@/lib/auth';
import { AccountSignUpForm } from './AccountSignUpForm';

/**
 * `/criar-conta` body: ORGANIZER account (ADR 0005). Session states (loading / not configured /
 * already has a profile) or the account form. The volunteer sign-up (home #participar,
 * /participar) needs no account since D48.
 *
 * Once the form is on screen it stays mounted: the Clerk session created inside the form
 * (code confirmed) must not swap it for a loading state before POST /registrations/account.
 */
export function AccountPanel({ territoryId, next }: { territoryId: string | null; next: string }) {
  const session = useSession();
  const active = session.status === 'active' ? session.session : null;
  const me = useMe(active);
  const [formShown, setFormShown] = useState(false);

  const registered =
    !!me.data && me.data.selected_territory_id !== null && me.data.phone_masked !== null;
  const wantsForm =
    session.status === 'none' || (!!active && !me.isLoading && !registered && !formShown);
  if (wantsForm && !formShown) setFormShown(true);

  if (formShown) {
    return <AccountSignUpForm initialTerritoryId={territoryId} session={active} next={next} />;
  }
  if (session.status === 'loading' || (active && me.isLoading)) {
    return <LoadingBlock label="Verificando sua sessão…" lines={2} />;
  }
  if (session.status === 'unconfigured') {
    return (
      <Note tone="warning">
        A criação de conta está indisponível neste ambiente (login não configurado). O cadastro de
        voluntário e o mapa continuam funcionando.
      </Note>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Note>
        Você já tem conta de organizador
        {me.data?.display_name ? `, ${me.data.display_name}` : ''}. Não é preciso criar outra.
      </Note>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/criar-atividade">Propor atividade da campanha</ButtonLink>
        <ButtonLink to="/minhas-atividades" variant="secondary">
          Minhas atividades
        </ButtonLink>
      </div>
    </div>
  );
}
