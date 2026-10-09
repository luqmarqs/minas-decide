import { useSearchParams } from 'react-router';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { Note } from '@/components/ui/States';
import { useSession } from '@/lib/auth';
import { RegistrationForm } from '@/features/registration/RegistrationForm';

export default function ParticiparPage() {
  const [sp] = useSearchParams();
  const raw = sp.get('territorio');
  const territory = raw && TerritoryId.safeParse(raw).success && raw !== 'mg' ? raw : null;
  const session = useSession();
  const verified = session.status === 'active' && !session.session.user.is_anonymous;

  return (
    <PageShell
      title="Participar da campanha"
      lead="Faça parte da campanha de Lula em Minas Gerais. Cadastro rápido com nome, e-mail, WhatsApp e território; depois mostramos o grupo da campanha na sua região."
    >
      {session.status === 'loading' ? (
        <LoadingBlock label="Verificando sua sessão…" lines={2} />
      ) : session.status === 'unconfigured' ? (
        <Note tone="warning">
          O cadastro está indisponível neste ambiente (login não configurado). O mapa continua
          funcionando.
        </Note>
      ) : verified ? (
        <div className="flex flex-col gap-4">
          <Note>
            Você já tem cadastro com e-mail verificado neste navegador. Não é preciso se cadastrar
            de novo.
          </Note>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to={territory ? `/obrigado?territorio=${encodeURIComponent(territory)}` : '/'}
            >
              {territory ? 'Ver grupo deste território' : 'Voltar ao mapa'}
            </ButtonLink>
            <ButtonLink to="/criar-atividade" variant="secondary">
              Propor atividade da campanha
            </ButtonLink>
          </div>
        </div>
      ) : (
        <RegistrationForm initialTerritoryId={territory} />
      )}
    </PageShell>
  );
}
