/**
 * Parte 1 da home (pedido do cliente, 2026-10-14): o texto da campanha, logo abaixo do hero.
 * Quatro blocos curtos (título + parágrafo) numa grade de duas colunas a partir de md.
 * Copy fornecida pelo cliente — não editar sem aprovação.
 */
const BLOCKS = [
  {
    title: 'É hora de disputar voto a voto!',
    body: 'O primeiro turno terminou com uma vitória apertada de Flávio Bolsonaro. No entanto, há milhões de votos brancos, nulos e abstenções apenas no nosso estado. A disputa segue aberta: é hora de conversar, mobilizar e virar votos!',
  },
  {
    title: 'Minas Gerais pode decidir o futuro do Brasil!',
    body: 'Com o segundo maior eleitorado do país e uma das maiores taxas de abstenção, Minas tem um papel central nessa disputa. Cada voto importa!',
  },
  {
    title: 'Com Lula, vamos preparar o enfrentamento a Cleitinho!',
    body: 'Nossa mobilização também será fundamental para defender os serviços públicos, nossas serras, a cultura negra e periférica e a democracia em Minas.',
  },
  {
    title: 'É hora de se organizar!',
    body: 'Não estamos sozinhos, estamos dispersos. Já tem gente panfletando, conversando com vizinhos e mobilizando as redes. Vamos reunir essas iniciativas e fortalecer a virada em todo o estado. Participe!',
  },
] as const;

export function Manifesto() {
  return (
    <section
      id="manifesto"
      aria-label="Por que agora"
      className="ed-section scroll-mt-(--header-height)"
      data-testid="manifesto"
    >
      <div className="mx-auto grid max-w-(--content-max) grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
        {BLOCKS.map((b) => (
          <article key={b.title} className="flex flex-col gap-3">
            <hr className="ed-rule-strong" aria-hidden="true" />
            <h2 className="max-w-[24ch] text-2xl text-balance sm:text-3xl">{b.title}</h2>
            <p className="ed-measure text-secondary sm:text-lg">{b.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
