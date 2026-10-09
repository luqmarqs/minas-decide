import { useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { useMe, useSession } from '@/lib/auth';
import { RegistrationForm } from './RegistrationForm';

/**
 * Sign-up body shared by `/participar` and the home section `#participar` (D28): session
 * states (loading / not configured / already registered) or the quick registration form.
 * After a successful submit the form navigates to `/obrigado` (same flow everywhere).
 *
 * Once the form is on screen it stays mounted: the Clerk session created inside the form
 * (code confirmed) must not swap it for a loading state before POST /registrations.
 */
export function ParticipationPanel({ territoryId }: { territoryId: string | null }) {
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
    return <RegistrationForm initialTerritoryId={territoryId} session={active} />;
  }
  if (session.status === 'loading' || (active && me.isLoading)) {
    return <LoadingBlock label="Verificando sua sessão…" lines={2} />;
  }
  if (session.status === 'unconfigured') {
    return (
      <Note tone="warning">
        O cadastro está indisponível neste ambiente (login não configurado). O mapa continua
        funcionando.
      </Note>
    );
  }
  const groupTerritory = territoryId ?? me.data?.selected_territory_id ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Note>
        Você já tem cadastro com e-mail verificado
        {me.data?.display_name ? `, ${me.data.display_name}` : ''}. Não é preciso se cadastrar de
        novo.
      </Note>
      <div className="flex flex-wrap gap-2">
        <ButtonLink
          to={groupTerritory ? `/obrigado?territorio=${encodeURIComponent(groupTerritory)}` : '/'}
        >
          {groupTerritory ? 'Ver grupo da sua região' : 'Voltar ao mapa'}
        </ButtonLink>
        <ButtonLink to="/criar-atividade" variant="secondary">
          Propor atividade da campanha
        </ButtonLink>
      </div>
    </div>
  );
}
