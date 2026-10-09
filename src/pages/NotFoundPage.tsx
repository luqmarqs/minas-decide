import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <PageShell
      title="Página não encontrada"
      lead="O endereço pode estar incorreto ou o conteúdo foi removido."
    >
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/">Voltar ao mapa</ButtonLink>
        <ButtonLink to="/metodologia" variant="secondary">
          Metodologia
        </ButtonLink>
      </div>
    </PageShell>
  );
}
