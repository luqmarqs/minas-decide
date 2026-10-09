import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';

/** Placeholder — o formulário/fluxo desta rota será implementado em outra tarefa. */
export default function ObrigadoPage() {
  return (
    <PageShell
      title="Obrigado"
      lead="Confirmação do cadastro e link do grupo aprovado do seu território (ou alternativa honesta)."
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
