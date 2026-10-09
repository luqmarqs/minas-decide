import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { useSession } from '@/lib/auth';
import { RegistrationForm } from './RegistrationForm';

/**
 * Sign-up body shared by `/participar` and the home section `#participar` (D28): session
 * states (loading / not configured / already verified) or the quick registration form.
 * After a successful submit the form navigates to `/obrigado` (same flow everywhere).
 */
export function ParticipationPanel({ territoryId }: { territoryId: string | null }) {
  const session = useSession();
  const verified = session.status === 'active' && !session.session.user.is_anonymous;

  if (session.status === 'loading') {
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
  if (verified) {
    return (
      <div className="flex flex-col gap-4">
        <Note>
          Você já tem cadastro com e-mail verificado neste navegador. Não é preciso se cadastrar de
          novo.
        </Note>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            to={territoryId ? `/obrigado?territorio=${encodeURIComponent(territoryId)}` : '/'}
          >
            {territoryId ? 'Ver grupo deste território' : 'Voltar ao mapa'}
          </ButtonLink>
          <ButtonLink to="/criar-atividade" variant="secondary">
            Propor atividade da campanha
          </ButtonLink>
        </div>
      </div>
    );
  }
  return <RegistrationForm initialTerritoryId={territoryId} />;
}
