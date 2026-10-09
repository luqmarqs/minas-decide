import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';

/** Placeholder — o formulário/fluxo desta rota será implementado em outra tarefa. */
export default function CriarAtividadePage() {
  return (
    <PageShell
      title="Organizar uma atividade"
      lead="Exige e-mail verificado. A atividade é revisada antes de ser publicada."
    >
      <Note>Em construção nesta rodada.</Note>
      <div className="mt-6">
        <ButtonLink to="/" variant="secondary">
          Voltar ao mapa
        </ButtonLink>
      </div>
    </PageShell>
  );
}
