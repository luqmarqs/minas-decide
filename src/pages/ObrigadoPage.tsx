import { Link, useLocation, useSearchParams } from 'react-router';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';
import { useSession } from '@/lib/auth';
import { SendLinkForm } from '@/features/auth/SendLinkForm';
import type { ObrigadoState } from '@/features/registration/api';
import { useTerritoryName } from '@/features/registration/useTerritoryName';
import { GroupInvite } from '@/features/whatsapp-groups/GroupInvite';

function readState(state: unknown): ObrigadoState | null {
  if (!state || typeof state !== 'object') return null;
  const s = (state as { emailState?: unknown }).emailState;
  return s === 'pending' || s === 'unverified' || s === 'verified' ? { emailState: s } : null;
}

export default function ObrigadoPage() {
  const [sp] = useSearchParams();
  const location = useLocation();
  const raw = sp.get('territorio');
  const territoryId = raw && TerritoryId.safeParse(raw).success && raw !== 'mg' ? raw : null;
  const { label } = useTerritoryName(territoryId);
  const fromForm = readState(location.state);
  const session = useSession();
  const verified = session.status === 'active' && !session.session.user.is_anonymous;

  return (
    <PageShell
      title={fromForm ? 'Cadastro recebido' : 'Grupo da sua região'}
      lead={
        fromForm
          ? 'Seu cadastro foi registrado pelo servidor. Veja abaixo o grupo de WhatsApp da sua região.'
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

        <section aria-labelledby="sessao-titulo" className="flex flex-col gap-3">
          <h2 id="sessao-titulo" className="text-2xl">
            Sua sessão e seu e-mail
          </h2>
          {verified ? (
            <Note>
              Seu e-mail está verificado neste navegador. Você já pode organizar atividades.
            </Note>
          ) : (
            <>
              <p className="text-secondary">
                Agora você tem uma <strong>sessão provisória</strong> neste navegador: ela basta
                para ver o grupo da sua região. Para <strong>organizar atividades</strong> é preciso
                confirmar o e-mail. O link que enviamos faz isso: ao abri-lo neste navegador, sua
                sessão vira uma conta com e-mail verificado. Não há senha.
              </p>
              {fromForm?.emailState === 'pending' ? (
                <Note>
                  Enviamos um link de confirmação para o seu e-mail. Confira também o spam. O link
                  vale por pouco tempo e só pode ser usado uma vez.
                </Note>
              ) : null}
              {fromForm?.emailState === 'unverified' ? (
                <Note tone="warning">
                  Seu cadastro foi salvo, mas o e-mail de confirmação{' '}
                  <strong>não pôde ser enviado agora</strong> (limite de envio do provedor). Peça um
                  novo link abaixo daqui a alguns minutos.
                </Note>
              ) : null}
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer font-medium">
                  Não recebeu o e-mail? Pedir um novo link
                </summary>
                <div className="mt-3">
                  <SendLinkForm idPrefix="obrigado-link" next="/criar-atividade" />
                </div>
              </details>
            </>
          )}
        </section>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={territoryId ? `/territorio/${territoryId}` : '/'} variant="secondary">
            Voltar ao território
          </ButtonLink>
          <ButtonLink to="/criar-atividade" variant="ghost">
            Organizar uma atividade
          </ButtonLink>
        </div>
      </div>
    </PageShell>
  );
}
