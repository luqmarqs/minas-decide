import type { ReactNode } from 'react';
import { JoinCta } from '@/features/registration/JoinCta';
import './manifesto.css';

/**
 * Parte 1 da home (pedido do cliente, 2026-10-14; D47): o texto da campanha como cartaz.
 * Três linhas com numeral vazado + título em Anton + texto com o trecho-chave grifado em sol;
 * o quarto bloco ("É hora de se organizar!") é uma faixa sol com o convite para a inscrição.
 * Copy fornecida pelo cliente — não editar sem aprovação.
 */
function Mark({ children }: { children: ReactNode }) {
  return <strong className="manifesto-mark">{children}</strong>;
}

const ROWS: { title: string; body: ReactNode }[] = [
  {
    title: 'É hora de disputar voto a voto!',
    body: (
      <>
        O primeiro turno terminou com uma vitória apertada de Flávio Bolsonaro. No entanto, há{' '}
        <Mark>milhões de votos brancos, nulos e abstenções</Mark> apenas no nosso estado. A disputa
        segue aberta: é hora de conversar, mobilizar e virar votos!
      </>
    ),
  },
  {
    title: 'Minas Gerais pode decidir o futuro do Brasil!',
    body: (
      <>
        Com o <Mark>segundo maior eleitorado do país</Mark> e uma das maiores taxas de abstenção,
        Minas tem um papel central nessa disputa. Cada voto importa!
      </>
    ),
  },
  {
    title: 'Com Lula, vamos preparar o enfrentamento a Cleitinho!',
    body: (
      <>
        Nossa mobilização também será fundamental para defender{' '}
        <Mark>
          os serviços públicos, nossas serras, a cultura negra e periférica e a democracia
        </Mark>{' '}
        em Minas.
      </>
    ),
  },
];

export function Manifesto() {
  return (
    <section id="manifesto" aria-label="Por que agora" data-testid="manifesto">
      <ol className="ed-section mx-auto flex max-w-(--content-max) flex-col gap-12 sm:gap-16">
        {ROWS.map((r, i) => (
          <li
            key={r.title}
            className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-x-10"
          >
            <div className="flex items-start gap-4 lg:col-span-7 sm:gap-6">
              <span
                className="manifesto-num brand-outline shrink-0 text-5xl leading-none sm:text-7xl"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="brand-display text-[2rem] leading-[1.02] text-balance uppercase sm:text-5xl lg:text-[3.4rem]">
                {r.title}
              </h2>
            </div>
            <p className="ed-measure text-lg leading-relaxed text-secondary lg:col-span-5 lg:pt-2 lg:text-xl">
              {r.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="manifesto-sun ed-section">
        <div className="mx-auto grid max-w-(--content-max) grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-x-10">
          <div className="flex items-start gap-4 lg:col-span-7 sm:gap-6">
            <span
              className="brand-outline shrink-0 text-5xl leading-none sm:text-7xl"
              aria-hidden="true"
            >
              04
            </span>
            <h2 className="brand-display text-[2.4rem] leading-[1.02] uppercase sm:text-6xl lg:text-7xl">
              É hora de se organizar!
            </h2>
          </div>
          <div className="flex flex-col items-start gap-5 lg:col-span-5">
            <p className="text-lg leading-relaxed lg:text-xl">
              Não estamos sozinhos, estamos dispersos. Já tem gente panfletando, conversando com
              vizinhos e mobilizando as redes. Vamos reunir essas iniciativas e fortalecer a virada
              em todo o estado. <strong>Participe!</strong>
            </p>
            <JoinCta size="lg">Inscreva-se</JoinCta>
          </div>
        </div>
      </div>
    </section>
  );
}
