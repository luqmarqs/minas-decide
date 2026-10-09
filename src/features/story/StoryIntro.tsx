import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MapLayerValues } from '@shared/contracts/metrics.ts';
import type { Highlights } from '@shared/contracts/snapshot.ts';
import { SunMark } from '@/components/brand/SunMark';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { JoinCta } from '@/features/registration/JoinCta';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { useAfterIdle, useNearViewport } from '@/lib/idle';
import { prefersReducedMotion } from '@/lib/media';
import { useHighlights, useLayerValues, useSnapshot } from '@/features/electoral-map/hooks';
import { MARGIN_GRADIENT, marginVar } from '@/features/electoral-map/palette';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import {
  compareLine,
  formatHighlightValue,
  type HighlightItem,
} from '@/features/highlights/format';
import { loadMunicipalGeo, projectMunicipalities, type ProjectedMap } from './geo';
import { StoryMap } from './StoryMap';

export interface StoryData {
  highlights: Highlights | null | undefined;
  margin2026: MapLayerValues | null | undefined;
  margin2022r2: MapLayerValues | null | undefined;
  map: ProjectedMap | null;
  geoFailed?: boolean;
  releaseId: string | null;
  demo: boolean;
}

/** Reveal on scroll (IntersectionObserver). Visible from the start when IO is missing
 *  or motion is reduced — content is never hidden behind an animation. */
function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(
    () => typeof IntersectionObserver === 'undefined' || prefersReducedMotion(),
  );
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return [ref, shown] as const;
}

function Step({
  n,
  title,
  children,
  aside,
}: {
  n: number;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const [ref, shown] = useReveal<HTMLLIElement>();
  return (
    <li
      ref={ref}
      data-step={n}
      data-shown={shown || undefined}
      className={cn(
        'grid items-center gap-5 border-t border-border py-7 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-10 lg:py-10',

        'motion-safe:transition-[opacity,translate] motion-safe:duration-(--duration-panel) motion-safe:ease-(--easing-standard)',
        shown ? 'translate-y-0 opacity-100' : 'motion-safe:translate-y-4 motion-safe:opacity-0',
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Passo {n} de 5</p>
        <h3 className="brand-display mt-1 text-[1.9rem] leading-[1.05] uppercase sm:text-[2.4rem]">
          {title}
        </h3>
        <div className="mt-3 flex max-w-xl flex-col gap-3 text-base text-secondary">{children}</div>
      </div>
      {aside ? <div className="min-w-0">{aside}</div> : null}
    </li>
  );
}

function MarginLegend({ year, round }: { year: number; round: number }) {
  return (
    <div aria-hidden="true">
      <div className="h-2.5 rounded-pill" style={{ backgroundImage: MARGIN_GRADIENT }} />
      <p className="mt-1 flex justify-between text-xs text-muted">
        <span>{year === 2022 ? 'Jair Bolsonaro' : 'Flávio Bolsonaro'} à frente</span>
        <span>empate</span>
        <span>Lula à frente</span>
      </p>
      <p className="sr-only">{`${year}, ${round}º turno`}</p>
    </div>
  );
}

const STORY_MARGIN_SPAN = 30;

const marginFill = (layer: MapLayerValues | null | undefined) => {
  if (!layer) return () => undefined;
  // Fixed ±30 p.p. bands for the story: strong colour = margin of 15 p.p. or more; light =
  // up to 15 p.p.; neutral = up to 1.5 p.p. (the full ±60 p.p. domain washes most cities out).
  const domain: [number, number] = [-STORY_MARGIN_SPAN, STORY_MARGIN_SPAN];
  return (id: string) => {
    const v = layer.values[id];
    return v === undefined ? undefined : `var(${marginVar(v, domain)})`;
  };
};

/** Pure view of the narrative (unit-testable without network). */
export function StoryIntroView({
  highlights,
  margin2026,
  margin2022r2,
  map,
  geoFailed,
  releaseId,
  demo,
}: StoryData) {
  const items = useMemo(
    () => new Map((highlights?.items ?? []).map((i) => [i.id, i])),
    [highlights],
  );
  const it = (id: string): HighlightItem | undefined => items.get(id);
  const lula26 = it('mg_2026_r1_lula_share');
  const flavio26 = it('mg_2026_r1_flavio_share');
  const bolsonaroLeads = lula26 && flavio26 ? flavio26.value > lula26.value : true;
  const ledLula26 = it('mg_2026_r1_municipalities_led_lula');
  const ledBolso26 = it('mg_2026_r1_municipalities_led_bolsonaro');
  const ledLula22 = it('mg_2022_r2_municipalities_led_lula');
  const ledBolso22 = it('mg_2022_r2_municipalities_led_bolsonaro');
  const margin22 = it('mg_2022_r2_margin_votes');
  const abst = it('mg_2026_r1_abstention_votes') ?? it('mg_abstention_2026_r1');
  const blankNull = it('mg_2026_r1_blank_null_votes');
  const others = it('mg_2026_r1_other_candidates_votes');
  // D32: short source; provenance (files, release, dates) only on /metodologia.
  const src = 'Fonte: TSE · IBGE.';
  void releaseId;
  const fill26 = useMemo(() => marginFill(margin2026), [margin2026]);
  const fill22 = useMemo(() => marginFill(margin2022r2), [margin2022r2]);
  const solid = bolsonaroLeads ? 'var(--map-bolsonaro)' : 'var(--map-lula)';
  const solidFill = useMemo(() => () => solid, [solid]);
  const leaderName = bolsonaroLeads ? 'Flávio Bolsonaro' : 'Lula';

  return (
    <section
      aria-labelledby="story-title"
      className="border-b border-border bg-surface px-(--gutter) py-8 lg:px-6"
      data-testid="story-intro"
    >
      <div className="mx-auto max-w-(--content-max)">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="story-title" className="text-xl sm:text-2xl">
            Minas, cidade por cidade
          </h2>
          {demo ? <Badge variant="demo">{SNAPSHOT_STATUS_LABEL.demo}</Badge> : null}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Cinco passos sobre o que os mapas de Minas mostram — e o que escondem. Só aqui e na camada
          de margem do mapa usamos as cores das campanhas (vermelho: Lula; azul: Bolsonaro).
        </p>
        <ol className="mt-4">
          <Step
            n={1}
            title="O mapa do primeiro turno assusta"
            aside={
              <StoryMap
                map={map}
                failed={geoFailed}
                fillFor={solidFill}
                label={`Minas Gerais inteira pintada com a cor de ${leaderName}`}
                descId="story-desc-1"
                caption={
                  <>
                    Todo o estado na cor de quem teve mais votos em Minas no 1º turno de 2026 — um
                    resumo que apaga as diferenças entre os 853 municípios. Percentuais sobre os
                    votos válidos para Presidente. {src}
                  </>
                }
              />
            }
          >
            <p>
              Pintado de uma cor só, Minas parece ter escolhido um lado.
              {lula26 && flavio26 ? (
                <>
                  {' '}
                  No 1º turno de 2026, Flávio Bolsonaro teve{' '}
                  <strong className="text-primary">{formatHighlightValue(flavio26)}</strong> dos
                  votos válidos em Minas e Lula,{' '}
                  <strong className="text-primary">{formatHighlightValue(lula26)}</strong>.
                </>
              ) : null}
            </p>
          </Step>
          <Step
            n={2}
            title="Mas ele não é exatamente assim"
            aside={
              <StoryMap
                map={map}
                failed={geoFailed}
                fillFor={fill26}
                label="Minas Gerais colorida município a município pela margem entre Lula e Flávio Bolsonaro no 1º turno de 2026"
                descId="story-desc-2"
                legend={<MarginLegend year={2026} round={1} />}
                caption={
                  <>
                    Cada município pela margem de Lula sobre Flávio Bolsonaro no 1º turno de 2026,
                    em pontos percentuais dos votos válidos para Presidente (vermelho: Lula à
                    frente; azul: Bolsonaro à frente; tons claros: margem de até 15 p.p.; cinza: até
                    1,5 p.p.).
                    {ledLula26 && ledBolso26
                      ? ` Lula liderou em ${formatInt(ledLula26.value)} municípios e Flávio Bolsonaro em ${formatInt(ledBolso26.value)}.`
                      : ''}{' '}
                    {src}
                  </>
                }
              />
            }
          >
            <p>
              A cor sólida causa a impressão de uma parede impenetrável, o que não é verdade.
              Município a município, o mapa é um mosaico — com muita disputa apertada.
            </p>
            {ledLula26 && ledBolso26 ? (
              <p>
                Lula liderou em{' '}
                <strong className="text-primary">{formatInt(ledLula26.value)} municípios</strong>;
                Flávio Bolsonaro, em{' '}
                <strong className="text-primary">{formatInt(ledBolso26.value)}</strong>.
              </p>
            ) : null}
          </Step>
          <Step n={3} title="E tem gente que não veio com a gente, mas também não foi para lá">
            <p>No 1º turno de 2026, em Minas:</p>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Não foram votar (abstenção)', item: abst },
                { label: 'Votaram branco ou nulo para Presidente', item: blankNull },
                { label: 'Votaram em outras candidaturas', item: others },
              ].map(({ label, item }) => (
                <div key={label} className="rounded-md border border-border bg-surface-raised p-3">
                  <dt className="text-xs font-semibold text-secondary">{label}</dt>
                  <dd className="mt-1 text-xl font-bold text-primary tabular-nums">
                    {item ? formatInt(item.value) : '—'}
                  </dd>
                  <dd className="text-xs text-muted">
                    {item ? (compareLine(item) ?? '') : 'sem dado'}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm">
              São três grupos diferentes, medidos sobre bases diferentes (eleitorado apto,
              comparecimento e votos válidos) — não se somam e não indicam preferência por nenhuma
              candidatura. {src}
            </p>
            <div>
              <JoinCta>Quero participar</JoinCta>
            </div>
          </Step>
          <Step
            n={4}
            title="2022 foi decidido aqui"
            aside={
              <StoryMap
                map={map}
                failed={geoFailed}
                fillFor={fill22}
                label="Minas Gerais colorida município a município pela margem entre Lula e Jair Bolsonaro no 2º turno de 2022"
                descId="story-desc-4"
                legend={<MarginLegend year={2022} round={2} />}
                caption={
                  <>
                    Cada município pela margem de Lula sobre Jair Bolsonaro no 2º turno de 2022, em
                    pontos percentuais dos votos válidos para Presidente.
                    {ledLula22 && ledBolso22
                      ? ` Lula liderou em ${formatInt(ledLula22.value)} municípios e Jair Bolsonaro em ${formatInt(ledBolso22.value)}.`
                      : ''}{' '}
                    {src}
                  </>
                }
              />
            }
          >
            <p>
              Em 2022, Minas acompanhou o resultado do país.
              {margin22 ? (
                <>
                  {' '}
                  No 2º turno, Lula venceu no estado por{' '}
                  <strong className="text-primary">{formatInt(margin22.value)} votos</strong>
                  {compareLine(margin22) ? ` — ${compareLine(margin22)}` : ''}.
                </>
              ) : null}
            </p>
          </Step>
          <Step n={5} title="A gente não pode se sentir sozinho, independente do resultado">
            <p className="flex items-start gap-3">
              <SunMark size={44} className="mt-1 shrink-0 text-(--map-activity)" />
              <span>
                Tem gente organizando panfletagens, conversas e caminhadas pela campanha de Lula em
                todo o estado. O sol no mapa marca onde já tem atividade. Chegue junto ou proponha
                uma no seu bairro.
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <JoinCta size="lg">Quero participar</JoinCta>
              <ButtonLink to="/#mapa" variant="secondary" size="lg">
                Ver atividades no mapa
              </ButtonLink>
            </div>
          </Step>
        </ol>
      </div>
    </section>
  );
}

function StoryWithData() {
  const { data: snap } = useSnapshot();
  const hq = useHighlights();
  // FE-10: the IBGE mesh (~130 KB gz, 853 paths to project) and the two margin layers are
  // only requested when the narrative approaches the screen, not right after idle.
  const boxRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(boxRef, false, '50% 0px');
  const m26 = useLayerValues('president_margin', 2026, 1, null, { enabled: near });
  const m22 = useLayerValues('president_margin', 2022, 2, null, { enabled: near });
  const [map, setMap] = useState<ProjectedMap | null>(null);
  const [geoFailed, setGeoFailed] = useState(false);
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    loadMunicipalGeo()
      .then((g) => {
        if (!cancelled) setMap(projectMunicipalities(g));
      })
      .catch(() => {
        if (!cancelled) setGeoFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [near]);
  return (
    <div ref={boxRef}>
      <StoryIntroView
        highlights={hq.data}
        margin2026={m26.data}
        margin2022r2={m22.data}
        map={map}
        geoFailed={geoFailed}
        releaseId={snap?.releaseId ?? null}
        demo={snap?.status === 'demo'}
      />
    </div>
  );
}

/**
 * Narrative section of the home (owner decision D25), between the hero and the key
 * numbers. Static SVG maps (no MapLibre), steps revealed on scroll without blocking it.
 * Data (highlights + margin layers + IBGE mesh) is only requested after load + idle.
 */
export function StoryIntro({ start }: { start?: boolean }) {
  const ready = useAfterIdle(start);
  if (!ready)
    return (
      <StoryIntroView
        highlights={null}
        margin2026={null}
        margin2022r2={null}
        map={null}
        releaseId={null}
        demo={false}
      />
    );
  return <StoryWithData />;
}
