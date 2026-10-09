import { Link, useLocation, useSearchParams } from 'react-router';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';
import type { ObrigadoState } from '@/features/registration/api';
import { useTerritoryName } from '@/features/registration/useTerritoryName';
import { GroupInvite } from '@/features/whatsapp-groups/GroupInvite';

function fromRegistration(state: unknown): boolean {
  return (
    !!state && typeof state === 'object' && (state as Partial<ObrigadoState>).registered === true
  );
}

export default function ObrigadoPage() {
  const [sp] = useSearchParams();
  const location = useLocation();
  const raw = sp.get('territorio');
  const territoryId = raw && TerritoryId.safeParse(raw).success && raw !== 'mg' ? raw : null;
  const { label } = useTerritoryName(territoryId);
  const fromForm = fromRegistration(location.state);

  return (
    <PageShell
      title={fromForm ? 'Cadastro recebido' : 'Grupo da sua região'}
      lead={
        fromForm
          ? 'Você agora faz parte da mobilização da campanha de Lula em Minas. Seu cadastro foi registrado pelo servidor; veja abaixo o grupo de WhatsApp da sua região.'
          : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {territoryId ? (
          <GroupInvite territoryId={territoryId} territoryName={label ?? 'a sua região'} />
        ) : (
          <Note tone="warning">
            Nenhum território informado.{' '}
            <Link to="/" className="underline">
              Escolha sua cidade ou bairro no mapa
            </Link>{' '}
            para ver o grupo.
          </Note>
        )}
        {fromForm ? (
          <p className="text-secondary">
            Seu e-mail foi confirmado pelo código e você já entrou neste navegador. Você pode propor
            atividades da campanha na sua região.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={territoryId ? `/territorio/${territoryId}` : '/'} variant="secondary">
            Voltar ao território
          </ButtonLink>
          <ButtonLink to="/criar-atividade" variant="ghost">
            Propor atividade da campanha
          </ButtonLink>
        </div>
      </div>
    </PageShell>
  );
}
