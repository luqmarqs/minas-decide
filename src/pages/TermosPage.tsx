import { PageShell, Prose } from '@/components/layouts/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Note } from '@/components/ui/States';

export default function TermosPage() {
  return (
    <PageShell
      title="Termos de uso"
      eyebrow={<Badge variant="warning">Rascunho — revisão jurídica pendente</Badge>}
      lead="Regras provisórias de uso da plataforma."
    >
      <Note tone="warning">
        Rascunho sem validade jurídica final. A versão definitiva será publicada após revisão e
        indicará a organização responsável.
      </Note>
      <Prose className="mt-6">
        <h2>Uso dos dados eleitorais</h2>
        <p>
          Os indicadores são agregados públicos, com metodologia descrita na página de metodologia.
          Bairros são aproximações. Ao reutilizar números, cite a fonte e a versão do snapshot.
        </p>
        <h2>Atividades e grupos</h2>
        <p>
          Atividades e grupos são propostos por voluntários e passam por revisão antes de serem
          publicados. Conteúdo ofensivo, enganoso ou que exponha dados pessoais de terceiros será
          recusado ou removido.
        </p>
        <h2>“Eu vou”</h2>
        <p>
          Indica apenas intenção de participar; não é inscrição, ingresso nem confirmação de
          presença.
        </p>
        <h2>Responsabilidade</h2>
        <p>[Organização responsável e foro — a definir.]</p>
      </Prose>
    </PageShell>
  );
}
