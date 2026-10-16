/**
 * Citação da Iza Lourença (pedido do cliente, 2026-10-15; D54), entre o texto da campanha e o
 * mapa. Faixa oliva (`.ed-band-ink`) com retrato 4:5 e aspas sol. Copy do cliente — não editar.
 */
export function IzaQuote() {
  return (
    <section aria-label="Palavra da Iza Lourença" data-testid="iza-quote" className="ed-band-ink">
      <figure className="ed-section mx-auto grid max-w-(--content-max) grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-x-10">
        <picture className="mx-auto block w-full max-w-[16rem] sm:max-w-xs md:col-span-5 md:max-w-none">
          <source
            type="image/webp"
            srcSet="/campanha/iza-480.webp 480w, /campanha/iza-960.webp 960w"
            sizes="(min-width: 768px) 40vw, 90vw"
          />
          <img
            src="/campanha/iza-960.jpg"
            srcSet="/campanha/iza-480.jpg 480w, /campanha/iza-960.jpg 960w"
            sizes="(min-width: 768px) 40vw, 90vw"
            width={960}
            height={1200}
            loading="lazy"
            decoding="async"
            alt="Retrato de Iza Lourença, de óculos vermelhos, lenço estampado e camisa listrada."
            className="block aspect-[4/5] w-full rounded-card object-cover"
          />
        </picture>
        <div className="flex flex-col gap-4 md:col-span-7">
          <span
            className="iza-quote-mark brand-display -mb-6 block h-12 text-7xl leading-none sm:h-14 sm:text-8xl"
            aria-hidden="true"
          >
            “
          </span>
          <blockquote className="text-xl leading-snug font-semibold text-balance sm:text-2xl lg:text-3xl">
            <p>
              Neste ano, fui eleita deputada estadual com mais de 100 mil votos em Minas Gerais.
              Cada voto que conquistamos representa nossa luta contra a extrema direita. Agora,
              vamos pra cima pela virada!{' '}
              <span className="iza-quote-strong brand-display uppercase">
                Família Bolsonaro nunca mais!
              </span>
            </p>
          </blockquote>
          <figcaption className="flex flex-col gap-0.5">
            <span className="text-lg font-semibold">Iza Lourença</span>
            <span className="text-secondary">Deputada estadual eleita por Minas Gerais</span>
          </figcaption>
        </div>
      </figure>
    </section>
  );
}
