import { useSearchParams } from 'react-router';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';

/** Placeholder — o formulário/fluxo desta rota será implementado em outra tarefa. */
export default function ParticiparPage() {
  const [sp] = useSearchParams();
  const territorio = sp.get('territorio');
  return (
    <PageShell
      title="Participar"
      lead="Cadastro rápido com nome, e-mail, WhatsApp e território. O território escolhido no mapa fica guardado."
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
