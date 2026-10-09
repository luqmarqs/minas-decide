import type { ReactNode } from 'react';
import { HorizonDivider } from './HorizonDivider';

export interface BrandHeroProps {
  titleId: string;
  /** Optional DEMO notice (must stay visible when data is synthetic). */
  notice?: ReactNode;
  /** Territorial search. */
  search: ReactNode;
  /** Calls to action (campaign participation). */
  actions?: ReactNode;
}

/**
 * Home hero of the official "Minas Decide" identity (default): official key visual (responsive JPG,
 * eager + high priority: it is the LCP), title in Anton/Bungee Outline on the dark
 * olive band that continues the artwork's lower edge, search below, ochre horizon
 * as divider. Always a dark "island" (tokens remapped in .brand-hero). No motion.
 */
export function BrandHero({ titleId, notice, search, actions }: BrandHeroProps) {
  return (
    <section className="brand-hero" aria-labelledby={titleId}>
      <div className="xl:flex xl:flex-row-reverse xl:items-stretch">
        <div className="brand-hero__art xl:shrink-0">
          <picture>
            <source
              type="image/jpeg"
              srcSet="/brand/minas-decide-hero-800.jpg 800w, /brand/minas-decide-hero-1600.jpg 1600w"
              sizes="(min-width: 1280px) 86vh, 100vw"
            />
            <img
              src="/brand/minas-decide-hero-1600.jpg"
              width={1600}
              height={900}
              alt="Ilustração da campanha: sol amarelo nascendo atrás da serra ocre sob céu azul, com o letreiro Minas Decide."
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        </div>
        <div className="relative z-[3] -mt-8 px-(--gutter) pb-6 sm:-mt-10 lg:px-6 xl:mt-0 xl:flex xl:min-w-0 xl:flex-1 xl:flex-col xl:justify-center xl:py-8 xl:pr-10">
          <h1 id={titleId} className="leading-[1.02] uppercase">
            <span className="brand-display block text-[2.4rem] sm:text-5xl xl:text-[3.6rem]">
              Minas decide.
            </span>{' '}
            <span className="brand-outline mt-1 block text-[1.6rem] leading-[1.15] sm:text-[2.3rem] xl:text-[2.6rem]">
              Minas decide Lula.
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-secondary sm:mt-3">
            Venha fazer a campanha de Lula em Minas Gerais: encontre uma atividade perto de você,
            marque “Eu vou” ou organize uma ação no seu bairro. E veja, cidade por cidade, como
            Minas votou.
          </p>
          {notice ? <div className="mt-2">{notice}</div> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">{actions}</div> : null}
          <div className="mt-3 w-full max-w-md sm:mt-4">{search}</div>
        </div>
      </div>
      <HorizonDivider />
    </section>
  );
}
