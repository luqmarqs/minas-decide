import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';

/** Placeholder — o formulário/fluxo desta rota será implementado em outra tarefa. */
export default function AuthRetornoPage() {
  return (
    <PageShell
      title="Verificando seu acesso"
      lead="Tratamento seguro do link de acesso enviado por e-mail."
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
