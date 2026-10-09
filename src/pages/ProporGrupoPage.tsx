import { useSearchParams } from 'react-router';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';

/** Placeholder — o formulário/fluxo desta rota será implementado em outra tarefa. */
export default function ProporGrupoPage() {
  const [sp] = useSearchParams();
  const territorio = sp.get('territorio');
  return (
    <PageShell
      title="Propor um grupo"
      lead="Proponha um grupo de WhatsApp para um território. Ele passa por revisão antes de aparecer."
    >
      <Note>
        Em construção nesta rodada.{' '}
        {territorio ? (
          <>
            Território recebido: <span className="font-mono">{territorio}</span>.
          </>
        ) : null}
      </Note>
      <div className="mt-6">
        <ButtonLink to="/" variant="secondary">
          Voltar ao mapa
        </ButtonLink>
      </div>
    </PageShell>
  );
}
