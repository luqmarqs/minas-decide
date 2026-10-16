import { Link, useLocation } from 'react-router';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import type { ObrigadoState } from '@/features/registration/api';
import { ViraVotoGroup } from '@/features/whatsapp-groups/ViraVotoGroup';

function fromRegistration(state: unknown): boolean {
  return (
    !!state && typeof state === 'object' && (state as Partial<ObrigadoState>).registered === true
  );
}

/** Depois do cadastro: convite para o grupo único do vira-voto (D54). */
export default function ObrigadoPage() {
  const location = useLocation();
  const fromForm = fromRegistration(location.state);

  return (
    <PageShell
      title={fromForm ? 'Cadastro recebido' : 'Grupo do vira-voto'}
      lead={
        fromForm
          ? 'Você agora faz parte da mobilização pela virada em Minas. Seu cadastro foi registrado; o próximo passo é entrar no grupo do vira-voto.'
          : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <ViraVotoGroup />
        {fromForm ? (
          <p className="text-secondary">
            Guardamos seu contato para a equipe da campanha falar com você. Para propor atividades
            no mapa,{' '}
            <Link to="/entrar?next=%2Fcriar-atividade" className="underline">
              entre com o mesmo e-mail
            </Link>{' '}
            (enviamos um código; não há senha).
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/" variant="secondary">
            Voltar ao início
          </ButtonLink>
          <ButtonLink to="/criar-atividade" variant="ghost">
            Propor atividade da campanha
          </ButtonLink>
        </div>
      </div>
    </PageShell>
  );
}
