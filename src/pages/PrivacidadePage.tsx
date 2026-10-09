import { PageShell, Prose } from '@/components/layouts/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Note } from '@/components/ui/States';

export default function PrivacidadePage() {
  return (
    <PageShell
      title="Política de privacidade"
      eyebrow={<Badge variant="warning">Rascunho — revisão jurídica pendente</Badge>}
      lead="Texto provisório que descreve o funcionamento técnico atual. Não substitui a política definitiva."
    >
      <Note tone="warning">
        Este documento é um <strong>rascunho</strong> e ainda não passou por revisão jurídica. A
        versão definitiva indicará a organização controladora dos dados, a base legal de cada
        tratamento e o canal do encarregado (LGPD).
      </Note>
      <Prose className="mt-6">
        <h2>Navegação no mapa</h2>
        <p>
          Consultar o mapa e os dados eleitorais não exige cadastro. Os dados eleitorais são
          agregados por território e não identificam pessoas. Não usamos sua localização sem que
          você peça.
        </p>
        <h2>Cadastro</h2>
        <p>
          Se você se cadastrar, pedimos apenas nome, e-mail, WhatsApp e território de interesse —
          sem CPF, endereço residencial ou senha. Esses dados não aparecem em nenhuma página
          pública.
        </p>
        <h2>“Eu vou”</h2>
        <p>
          Marcar “Eu vou” não exige login: guardamos um identificador anônimo em um cookie deste
          navegador para evitar marcações duplicadas. O número exibido é aproximado e não revela
          quem marcou.
        </p>
        <h2>Contato público de atividades</h2>
        <p>
          O contato de quem organiza uma atividade só aparece se a própria pessoa autorizar, e pode
          ser retirado.
        </p>
        <h2>Seus direitos</h2>
        <p>[Canal para solicitar acesso, correção ou exclusão de dados — a definir.]</p>
      </Prose>
    </PageShell>
  );
}
