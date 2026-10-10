import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import type { MapLayerValues } from '@shared/contracts/metrics.ts';
import type { Highlights } from '@shared/contracts/snapshot.ts';
import { SunMark } from '@/components/brand/SunMark';
import { PlateHeading } from '@/components/editorial/PlateHeading';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { JoinCta } from '@/features/registration/JoinCta';
import { cn } from '@/lib/cn';
import { formatInt, formatPp } from '@/lib/format';
import { useAfterIdle, useNearViewport } from '@/lib/idle';
import { useHighlights, useLayerValues, useSnapshot } from '@/features/electoral-map/hooks';
import { MARGIN_GRADIENT, marginVar } from '@/features/electoral-map/palette';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { formatHighlightValue, type HighlightItem } from '@/features/highlights/format';
import { AbsenceBars, type AbsenceRow } from './AbsenceBars';
import { loadMunicipalGeo, projectMunicipalities, type ProjectedMap } from './geo';
import { StoryMap, type StoryMapSize } from './StoryMap';
import { useActiveStep, useReveal, useStoryMode, type StoryMode } from './useStoryScroll';

export interface StoryData {
  highlights: Highlights | null | undefined;
  margin2026: MapLayerValues | null | undefined;
  margin2022r2: MapLayerValues | null | undefined;
  map: ProjectedMap | null;
  geoFailed?: boolean;
  releaseId: string | null;
  demo: boolean;
}

function Step({
  n,
  title,
  mode,
  children,
  figure,
  srMap,
  source,
  impact,
  wide,
}: {
  n: number;
  title: string;
  mode: StoryMode;
  children: ReactNode;
  /** Static map(s) of the step (static mode only; in sticky mode the panel draws it). */
  figure?: ReactNode;
  /** Text description of the map for screen readers in sticky mode (the panel is aria-hidden). */
  srMap?: string;
  /** Source line, once per step, at its end. */
  source: string;
  /** Step 1: display title larger; olive band in static mode. */
  impact?: boolean;
  /** Step 3: full width (the bars are the figure). */
  wide?: boolean;
}) {
  const [ref, shown] = useReveal<HTMLLIElement>();
  const sticky = mode === 'sticky';
  const gridStyle: CSSProperties | undefined = sticky
    ? { gridColumn: wide ? '1 / -1' : '1 / 6', gridRow: n }
    : undefined;
  const band = impact && !sticky;
  const side = !!figure && !sticky;
  return (
    <li
      ref={ref}
      data-step={n}
      data-shown={shown || undefined}
      style={gridStyle}
      className={cn(
        'min-w-0 border-t border-border py-8 first:border-t-0 sm:py-10',
        sticky && !wide && 'flex min-h-[min(80vh,720px)] flex-col justify-center',
        sticky && wide && 'py-16',
        side && 'lg:grid lg:grid-cols-12 lg:gap-x-10 lg:py-14',
        band && 'ed-band-ink -mx-(--gutter) border-t-0 px-(--gutter) lg:-mx-6 lg:px-6',
        'motion-safe:transition-[opacity,translate] motion-safe:duration-(--duration-panel) motion-safe:ease-(--easing-standard)',
        shown ? 'translate-y-0 opacity-100' : 'motion-safe:translate-y-4 motion-safe:opacity-0',
      )}
    >
      <div className={cn('min-w-0', side && 'lg:col-span-5 lg:row-start-1')}>
        <p className="ed-kicker">
          Passo <span className="tabular-nums">{n}</span> de 5
        </p>
        <h3
          className={cn(
            'brand-display mt-2 uppercase',
            impact
              ? 'text-[2.6rem] leading-[0.95] sm:text-[3.4rem] lg:text-[4.25rem]'
              : 'text-[1.9rem] leading-[1.05] sm:text-[2.4rem]',
            wide && 'max-w-[24ch]',
          )}
        >
          {title}
        </h3>
      </div>
      {side ? (
        <div
          className={cn(
            'mt-5 min-w-0 md:z-[1] md:bg-surface md:pb-3 md:motion-safe:sticky md:motion-safe:top-[calc(var(--header-height)+0.5rem)]',
            'lg:static lg:col-span-7 lg:col-start-6 lg:row-span-3 lg:row-start-1 lg:mt-0 lg:self-center lg:pb-0',
          )}
        >
          {figure}
        </div>
      ) : null}
      <div
        className={cn(
          'mt-4 flex min-w-0 flex-col gap-4 text-base text-secondary',
          wide ? 'max-w-none' : 'max-w-xl',
          side && 'lg:col-span-5 lg:col-start-1 lg:row-start-2',
        )}
      >
        {children}
        {sticky && srMap ? <p className="sr-only">{`Mapa: ${srMap}`}</p> : null}
      </div>
      <p
        id={`story-src-${n}`}
        className={cn('ed-caption mt-5', side && 'lg:col-span-5 lg:col-start-1 lg:row-start-3')}
      >
        {source}
      </p>
    </li>
  );
}

function MarginLegend({ year, round }: { year: number; round: number }) {
  return (
    <div aria-hidden="true">
      <div className="h-2.5 rounded-pill" style={{ backgroundImage: MARGIN_GRADIENT }} />
      <p className="mt-1 flex justify-between gap-2 text-xs text-muted">
        <span>{year === 2022 ? 'Jair Bolsonaro' : 'Flávio Bolsonaro'} à frente</span>
        <span>empate</span>
        <span>Lula à frente</span>
      </p>
      <p className="sr-only">{`${year}, ${round}º turno`}</p>
    </div>
  );
}

/** Decorative sun of step 5: the legend symbol of activities on the interactive map below. */
function SunOverlay({ large }: { large?: boolean }) {
  return (
    <div className="pointer-events-none absolute right-0 bottom-0" aria-hidden="true">
      <SunMark size={large ? 96 : 56} className="text-(--map-activity)" />
    </div>
  );
}

interface PanelLayer {
  state: number;
  content: ReactNode;
}

/**
 * Sticky map of the scrollytelling (≥ 1024 px, motion allowed). Each state is a whole SVG
 * stacked in the same cell; the active one fades in (opacity on the layer, never on the 853
 * paths). Visual only: the steps carry the same information as text (`srMap`).
 */
function StickyPanel({
  rows,
  state,
  layers,
}: {
  rows: string;
  state: number;
  layers: PanelLayer[];
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="story-sticky"
      data-story-state={state}
      className="min-w-0"
      style={{ gridColumn: '6 / -1', gridRow: rows }}
    >
      <div
        className="ed-sticky grid grid-cols-1 grid-rows-1"
        style={{
          height: 'min(70vh, 640px)',
          maxHeight: 'calc(100vh - var(--header-height) - 2rem)',
          // Centred in the space under the header (never above header + 0.75rem).
          top: 'max(calc(var(--header-height) + 0.75rem), calc(var(--header-height) + (100vh - var(--header-height) - min(70vh, 640px)) / 2))',
        }}
      >
        {layers.map(({ state: s, content }) => {
          const on = s === state;
          return (
            <div
              key={s}
              data-layer={s}
              data-active={on || undefined}
              className={cn(
                'col-start-1 row-start-1 flex min-h-0 flex-col',
                'motion-safe:transition-[opacity,visibility] motion-safe:duration-(--duration-panel) motion-safe:ease-(--easing-standard)',
                on ? 'visible opacity-100' : 'invisible opacity-0',
              )}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Owns the active step so that scrolling re-renders only the two panels: the layer elements
 * come from the parent render and keep their identity, so React skips the 853-path SVGs and
 * only flips the layer classes. The active step is mirrored on the section
 * (`data-story-state`) for styling hooks and tests.
 */
function ScrollyStage({
  listRef,
  sectionRef,
  first,
  second,
}: {
  listRef: RefObject<HTMLOListElement | null>;
  sectionRef: RefObject<HTMLElement | null>;
  first: PanelLayer[];
  second: PanelLayer[];
}) {
  const active = useActiveStep(listRef, true);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    el.dataset.storyState = String(active);
    return () => {
      delete el.dataset.storyState;
    };
  }, [active, sectionRef]);
  return (
    <>
      <StickyPanel rows="1 / 3" state={Math.min(active, 2)} layers={first} />
      <StickyPanel rows="4 / 6" state={Math.max(active, 4)} layers={second} />
    </>
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

const ppOf = (item: HighlightItem | undefined) =>
  item && item.compare_value !== null && item.compare_value !== undefined
    ? /p\.p\./.test(item.compare_label ?? '')
      ? formatPp(item.compare_value)
      : null
    : null;

const SRC_MAP = 'Fonte: TSE · IBGE.';

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
  const mode = useStoryMode();
  const sticky = mode === 'sticky';
  const listRef = useRef<HTMLOListElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

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
  const marginBr22 = it('br_2022_r2_margin_votes');
  const eligible = it('mg_eligible_2026');
  const turnout = it('mg_turnout_2026_r1');
  const abst = it('mg_2026_r1_abstention_votes') ?? it('mg_abstention_2026_r1');
  const blankNull = it('mg_2026_r1_blank_null_votes');
  const others = it('mg_2026_r1_other_candidates_votes');
  // Valid votes have no highlight of their own in the snapshot: derived as turnout minus
  // blank + null (the same identity the ETL uses), and said so in the note.
  const validItem = it('mg_2026_r1_valid_votes');
  const valid =
    validItem?.value ?? (turnout && blankNull ? turnout.value - blankNull.value : undefined);
  const validDerived = !validItem && valid !== undefined;
  // D32: short source; provenance (files, release, dates) only on /metodologia.
  void releaseId;
  const fill26 = useMemo(() => marginFill(margin2026), [margin2026]);
  const fill22 = useMemo(() => marginFill(margin2022r2), [margin2022r2]);
  const solid = bolsonaroLeads ? 'var(--map-bolsonaro)' : 'var(--map-lula)';
  const leaderName = bolsonaroLeads ? 'Flávio Bolsonaro' : 'Lula';
  const pp22 = ppOf(margin22);
  const ppBr22 = ppOf(marginBr22);

  const absenceRows: AbsenceRow[] = [
    {
      key: 'abst',
      label: 'Não foram votar (abstenção)',
      item: abst,
      base: eligible?.value,
      baseLabel: 'aptos',
    },
    {
      key: 'blank-null',
      label: 'Votaram branco ou nulo para Presidente',
      item: blankNull,
      base: turnout?.value,
      baseLabel: 'que compareceram',
    },
    {
      key: 'others',
      label: 'Votaram em outras candidaturas',
      item: others,
      base: valid,
      baseLabel: 'votos válidos',
    },
  ];

  // ---- map descriptions (shared by the static figures, the sticky panel and srMap) ----
  const label1 = `Minas Gerais inteira pintada com a cor de ${leaderName}`;
  const cap1 =
    'Todo o estado na cor de quem teve mais votos em Minas no 1º turno de 2026 — um resumo que apaga as diferenças entre os 853 municípios.';
  const label2 =
    'Minas Gerais colorida município a município pela margem entre Lula e Flávio Bolsonaro no 1º turno de 2026';
  const cap2 = 'Margem de Lula sobre Flávio Bolsonaro em cada município, 1º turno de 2026.';
  const bands =
    'Pontos percentuais dos votos válidos para Presidente. Vermelho: Lula à frente; azul: Bolsonaro à frente; tons claros: margem de até 15 p.p.; cinza: até 1,5 p.p.';
  const label4 =
    'Minas Gerais colorida município a município pela margem entre Lula e Jair Bolsonaro no 2º turno de 2022';
  const cap4 = `Margem de Lula sobre Jair Bolsonaro em cada município, 2º turno de 2022, nas mesmas faixas do passo 2.${
    ledLula22 && ledBolso22
      ? ` Lula liderou em ${formatInt(ledLula22.value)} municípios e Jair Bolsonaro em ${formatInt(ledBolso22.value)}.`
      : ''
  }`;
  const label5 =
    'Minas Gerais município a município pela margem do 1º turno de 2026, em tom suave, com o símbolo do sol';
  const cap5 =
    'O mosaico do 1º turno de 2026, como no passo 2. No mapa interativo, logo abaixo, o sol marca onde já tem atividade.';

  const wall = (size: StoryMapSize, descId: string, extra: string[], caption: ReactNode) => (
    <StoryMap
      map={map}
      failed={geoFailed}
      uniformFill={solid}
      label={label1}
      descId={descId}
      describedBy={extra}
      caption={caption}
      size={size}
      kicker={size === 'small' ? 'Resumo' : undefined}
    />
  );
  const mosaic26 = (size: StoryMapSize, descId: string, extra: string[], caption: ReactNode) => (
    <StoryMap
      map={map}
      failed={geoFailed}
      fillFor={fill26}
      label={label2}
      descId={descId}
      describedBy={extra}
      caption={caption}
      size={size}
      kicker={size === 'small' ? 'Município a município' : undefined}
      legend={size === 'small' ? undefined : <MarginLegend year={2026} round={1} />}
    />
  );
  const mosaic22 = (size: StoryMapSize, descId: string, extra: string[]) => (
    <StoryMap
      map={map}
      failed={geoFailed}
      fillFor={fill22}
      label={label4}
      descId={descId}
      describedBy={extra}
      caption={cap4}
      size={size}
      legend={<MarginLegend year={2022} round={2} />}
    />
  );
  const sun26 = (size: StoryMapSize, descId: string, extra: string[]) => (
    <StoryMap
      map={map}
      failed={geoFailed}
      fillFor={fill26}
      label={label5}
      descId={descId}
      describedBy={extra}
      caption={cap5}
      size={size}
      dim
      overlay={<SunOverlay large={size === 'fill'} />}
    />
  );

  return (
    <section
      ref={sectionRef}
      aria-labelledby="story-title"
      className="ed-section border-b border-border bg-surface"
      data-testid="story-intro"
      data-story-mode={mode}
    >
      <div className="mx-auto max-w-(--content-max)">
        <PlateHeading
          number={1}
          kicker="Narrativa"
          title="Minas, cidade por cidade"
          id="story-title"
          aside={demo ? <Badge variant="demo">{SNAPSHOT_STATUS_LABEL.demo}</Badge> : null}
          lead={
            <>
              Cinco passos sobre o que os mapas de Minas mostram — e o que escondem. Só aqui e na
              camada de margem do mapa usamos as cores das campanhas (vermelho: Lula; azul:
              Bolsonaro).
            </>
          }
        />
        <div
          className={cn('mt-8 lg:mt-12', sticky && 'ed-grid-12')}
          style={sticky ? { rowGap: 0, gridTemplateRows: 'repeat(5, auto)' } : undefined}
        >
          <ol
            ref={listRef}
            className={cn('min-w-0', sticky ? 'grid grid-cols-subgrid grid-rows-subgrid' : '')}
            style={sticky ? { gridColumn: '1 / -1', gridRow: '1 / 6' } : undefined}
          >
            <Step
              n={1}
              impact
              mode={mode}
              title="O mapa do primeiro turno assusta"
              source={SRC_MAP}
              srMap={`${label1}. ${cap1}`}
              figure={wall('default', 'story-desc-1', ['story-src-1'], cap1)}
            >
              <p className="text-lg">
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
              mode={mode}
              title="Mas ele não é exatamente assim"
              source={SRC_MAP}
              srMap={`${label2}. ${cap2} ${bands}`}
              figure={
                <div className="flex flex-col gap-3" data-testid="story-compare">
                  <div className="grid grid-cols-2 items-start gap-3 sm:gap-6">
                    {wall('small', 'story-desc-2a', ['story-src-2'], 'O estado numa cor só.')}
                    {mosaic26('small', 'story-desc-2b', ['story-bands', 'story-src-2'], cap2)}
                  </div>
                  <MarginLegend year={2026} round={1} />
                  <p id="story-bands" className="ed-note">
                    {bands}
                  </p>
                </div>
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
            <Step
              n={3}
              wide
              mode={mode}
              title="E tem gente que não veio com a gente, mas também não foi para lá"
              source="Fonte: TSE."
            >
              <p className="max-w-xl">No 1º turno de 2026, em Minas:</p>
              <AbsenceBars rows={absenceRows} />
              <p className="ed-note ed-measure">
                São três grupos diferentes, medidos sobre bases diferentes (eleitorado apto,
                comparecimento e votos válidos) — não se somam e não indicam preferência por nenhuma
                candidatura. Cada barra vai de zero a 100% da sua própria base.
                {validDerived ? ' Votos válidos = comparecimento menos brancos e nulos.' : ''}
              </p>
            </Step>
            <Step
              n={4}
              mode={mode}
              title="2022 foi decidido aqui"
              source={SRC_MAP}
              srMap={`${label4}. ${cap4}`}
              figure={mosaic22('default', 'story-desc-4', ['story-src-4'])}
            >
              {margin22 ? (
                <div className="border-l-2 border-border-strong pl-4" aria-hidden="true">
                  <p className="ed-figure ed-figure-xl">{formatInt(margin22.value)}</p>
                  <p className="mt-2 text-sm font-semibold text-secondary">
                    votos de diferença
                    {pp22 ? <span className="tabular-nums"> · {pp22}</span> : null}
                  </p>
                </div>
              ) : null}
              <p>
                Em 2022, Minas acompanhou o resultado do país.
                {margin22 ? (
                  <>
                    {' '}
                    No 2º turno, Lula venceu no estado por{' '}
                    <strong className="text-primary">{formatInt(margin22.value)} votos</strong>
                    {pp22 ? ` — ${pp22.replace(/^\+/, '')} dos válidos` : ''}.
                  </>
                ) : null}
              </p>
              {marginBr22 ? (
                <p className="ed-note">
                  No Brasil, a diferença foi de {formatInt(marginBr22.value)} votos
                  {ppBr22 ? ` (${ppBr22.replace(/^\+/, '')})` : ''}.
                </p>
              ) : null}
            </Step>
            <Step
              n={5}
              mode={mode}
              title="A gente não pode se sentir sozinho, independente do resultado"
              source={SRC_MAP}
              srMap={`${label5}. ${cap5}`}
              figure={sun26('default', 'story-desc-5', ['story-src-5'])}
            >
              <p className="flex items-start gap-3">
                <SunMark size={44} className="mt-1 shrink-0 text-(--map-activity)" />
                <span>
                  Tem gente organizando panfletagens, conversas e caminhadas pela campanha de Lula
                  em todo o estado. O sol no mapa marca onde já tem atividade. Chegue junto ou
                  proponha uma no seu bairro.
                </span>
              </p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink to="/#mapa" size="lg">
                  Ver o seu bairro no mapa
                </ButtonLink>
                <JoinCta size="lg" variant="secondary">
                  Quero participar
                </JoinCta>
              </div>
            </Step>
          </ol>
          {sticky ? (
            <ScrollyStage
              listRef={listRef}
              sectionRef={sectionRef}
              first={[
                { state: 1, content: wall('fill', 'story-sticky-desc-1', [], cap1) },
                {
                  state: 2,
                  content: mosaic26(
                    'fill',
                    'story-sticky-desc-2',
                    [],
                    <>
                      {cap2} {bands}
                    </>,
                  ),
                },
              ]}
              second={[
                { state: 4, content: mosaic22('fill', 'story-sticky-desc-4', []) },
                { state: 5, content: sun26('fill', 'story-sticky-desc-5', []) },
              ]}
            />
          ) : null}
        </div>
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
 * numbers. Static SVG maps (no MapLibre); on wide screens a sticky map changes state as the
 * five steps scroll by (scrollytelling), elsewhere each step carries its own static map.
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
