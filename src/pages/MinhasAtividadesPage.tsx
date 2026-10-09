import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';

/** Placeholder — o formulário/fluxo desta rota será implementado em outra tarefa. */
export default function MinhasAtividadesPage() {
  return (
    <PageShell
      title="Minhas atividades"
      lead="Suas propostas de atividade e o status de revisão de cada uma."
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
