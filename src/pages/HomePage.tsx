import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { BrandHero } from '@/components/brand/BrandHero';
import { PlateHeading } from '@/components/editorial/PlateHeading';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { useBrandActive } from '@/lib/brand';
import { useAfterIdle } from '@/lib/idle';
import { prefersReducedMotion } from '@/lib/media';
import { DeferredMapShell } from '@/features/electoral-map/DeferredMapShell';
import { useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { useMapUrlState } from '@/features/electoral-map/useMapUrlState';
import { TerritorySearch } from '@/features/territory/TerritorySearch';
import { WhyMinasStrip } from '@/features/highlights/WhyMinasStrip';
import { HomeJoinSection } from '@/features/registration/HomeJoinSection';
import { JoinCta } from '@/features/registration/JoinCta';
import { scrollToJoin } from '@/features/registration/join';
import { StoryIntro } from '@/features/story/StoryIntro';
import { WhatsAppShare } from '@/components/ui/WhatsAppShare';
import { homeShareText } from '@/lib/share';

// Heavy parts (Zod contracts, API client, details panel) load after idle.
const TerritoryPanel = lazy(() =>
  import('@/features/territory/TerritoryPanel').then((m) => ({ default: m.TerritoryPanel })),
);
const ActivityAgenda = lazy(() =>
  import('@/features/activities/ActivityAgenda').then((m) => ({ default: m.ActivityAgenda })),
);

function AgendaPlaceholder() {
  return (
    <div className="min-h-40">
      <LoadingBlock label="Carregando agenda…" lines={3} />
    </div>
  );
}

const SEARCH_ID = 'busca-territorio';
const MAP_SEARCH_ID = 'busca-territorio-mapa';

/**
 * FE-10: content above the map (narrative maps, key numbers) can still change height while
 * the smooth scroll runs; once it settles, align the map under the header again — unless
 * the person scrolled/touched in the meantime (never fight the user).
 */
function realignMap(section: HTMLElement | null) {
  if (!section || typeof window === 'undefined') return;
  let userMoved = false;
  const mark = () => {
    userMoved = true;
  };
  const opts = { passive: true, once: true } as const;
  // Next tick: the Enter/click that selected the territory must not count as "moved".
  window.setTimeout(() => {
    window.addEventListener('wheel', mark, opts);
    window.addEventListener('touchstart', mark, opts);
    window.addEventListener('keydown', mark, { once: true });
  }, 0);
  window.setTimeout(() => {
    window.removeEventListener('wheel', mark);
    window.removeEventListener('touchstart', mark);
    window.removeEventListener('keydown', mark);
    const header = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--header-height'),
    );
    const off = section.getBoundingClientRect().top - (Number.isFinite(header) ? header : 56);
    if (!userMoved && Math.abs(off) > 4) section.scrollIntoView?.({ block: 'start' });
  }, 1200);
}

/**
 * Home (spec §12.5 + rodadas 3/D28 + redesign editorial): campaign hero (CTA + search, frozen)
 * → prancha 01 narrative → prancha 02 "Por que Minas decide" → prancha 03 map+layers+panel →
 * prancha 04 agenda (editorial rows) → closing sign-up band (#participar) → footer. Every
 * "participar" CTA scrolls to the sign-up section.
 */
export default function HomePage() {
  const [state, update] = useMapUrlState();
  // Passive: the snapshot is fetched by the map after idle, not before first paint.
  const { data: snap } = useSnapshot({ enabled: false });
  const location = useLocation();
  const [interacted, setInteracted] = useState(false);
  const mapSectionRef = useRef<HTMLElement>(null);
  const agendaReady = useAfterIdle(location.hash === '#agenda');
  const brand = useBrandActive();

  useEffect(() => {
    if (location.hash === '#busca') document.getElementById(SEARCH_ID)?.focus();
    if (location.hash === '#agenda') document.getElementById('agenda')?.scrollIntoView();
    if (location.hash === '#mapa') document.getElementById('mapa')?.scrollIntoView();
    if (location.hash === '#participar') scrollToJoin();
  }, [location.hash, location.key]);

  const onSelectTerritory = (e: TerritoryIndexEntry) => {
    setInteracted(true);
    update({ territoryId: e.id, view: state.view }, { push: true });
    // Bring the map up (the key numbers sit between hero and map): on mobile the
    // half-open sheet then leaves the map visible above it (P-UX-2); on desktop the
    // camera flies to the territory with the side panel open.
    mapSectionRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    realignMap(mapSectionRef.current);
  };

  const search = (
    <TerritorySearch id={SEARCH_ID} size="lg" className="w-full" onSelect={onSelectTerritory} />
  );

  return (
    <>
      <title>Minas Decide Lula — campanha, agenda e mapa eleitoral de Minas Gerais</title>
      {/* Desktop: hero + map fill the viewport whatever the hero height (DEMO badge
          included), so the map attribution is never cut (P-UX-4). −1px: header border.
          Official identity (default): the illustrated hero is taller, so the map gets its own
          viewport; the compact hero only remains under the `provisorio` rollback theme. */}
      <div
        className={
          brand
            ? 'flex flex-col'
            : 'flex flex-col lg:h-[calc(100dvh-var(--header-height)-1px)] lg:min-h-[44rem]'
        }
      >
        {brand ? (
          <BrandHero
            titleId="home-title"
            notice={
              snap?.status === 'demo' ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-secondary">
                  <Badge variant="demo">{SNAPSHOT_STATUS_LABEL.demo}</Badge>
                  Snapshot oficial ainda não publicado: os números abaixo são sintéticos.
                </p>
              ) : null
            }
            search={search}
            actions={
              <>
                <JoinCta size="lg">Quero participar da campanha</JoinCta>
                <ButtonLink to="/#agenda" variant="secondary" size="lg">
                  Ver atividades
                </ButtonLink>
                <WhatsAppShare text={homeShareText()} variant="ghost" size="lg" />
              </>
            }
          />
        ) : (
          <section
            className="border-b border-border bg-surface px-(--gutter) pt-5 pb-4 lg:px-6"
            aria-labelledby="home-title"
          >
            <div className="mx-auto flex max-w-(--content-max) flex-col gap-4 lg:max-w-none lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <h1 id="home-title" className="text-2xl sm:text-3xl">
                  Minas Gerais, território por território
                </h1>
                <p className="mt-1 text-secondary">
                  Veja participação e votação por cidade e bairro, e encontre atividades presenciais
                  perto de você.
                </p>
                {snap?.status === 'demo' ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-secondary">
                    <Badge variant="demo">{SNAPSHOT_STATUS_LABEL.demo}</Badge>
                    Snapshot oficial ainda não publicado: os números abaixo são sintéticos.
                  </p>
                ) : null}
              </div>
              <div className="w-full lg:max-w-md">{search}</div>
            </div>
          </section>
        )}

        <StoryIntro start={interacted} />

        <WhyMinasStrip start={interacted} />

        {/* Prancha 03 — abertura curta do mapa (redesign editorial, D7/D8): a narrativa termina
            convidando a ver o bairro e desemboca aqui, sem faixa de CTA no meio. No desktop a
            busca se repete ao lado do título (o hero ficou duas seções acima); no celular o mapa
            ocupa a tela logo abaixo e a busca do hero basta. */}
        <div className="px-(--gutter) pt-10 pb-5 sm:pt-14 lg:px-6 lg:pt-16 lg:pb-6">
          <div className="mx-auto flex max-w-(--content-max) flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <PlateHeading
              number={3}
              kicker="Mapa"
              title="Veja o seu bairro"
              id="mapa-title"
              size="md"
              className="min-w-0 flex-1"
              lead="Abstenção, brancos e nulos e votação por cidade e bairro. Bairros são aproximados pelos locais de votação."
            />
            <div className="hidden w-full max-w-sm shrink-0 lg:block" data-testid="map-search">
              <TerritorySearch
                id={MAP_SEARCH_ID}
                label="Busque uma cidade ou bairro no mapa"
                className="w-full"
                onSelect={onSelectTerritory}
              />
            </div>
          </div>
        </div>

        <section
          ref={mapSectionRef}
          id="mapa"
          aria-label="Mapa de Minas Gerais"
          // FE-10 (phones): the map takes the whole screen under the header (the compact bar
          // and the collapsed sheet are overlays), so selecting a territory leaves ≥ 55 % of
          // the viewport as visible map. Page scroll still works (cooperative gestures).
          className={
            brand
              ? 'h-[calc(100dvh-var(--header-height))] min-h-[440px] scroll-mt-(--header-height) lg:h-[calc(100dvh-var(--header-height)-1px)] lg:min-h-[560px]'
              : 'h-[calc(100dvh-var(--header-height))] min-h-[440px] scroll-mt-(--header-height) lg:h-auto lg:min-h-[560px] lg:flex-1'
          }
        >
          <DeferredMapShell
            start={interacted}
            className="h-full"
            state={state}
            onStateChange={update}
            panel={
              <Suspense fallback={null}>
                <TerritoryPanel
                  territoryId={state.territoryId}
                  year={state.year}
                  round={state.round}
                  candidateId={state.candidateId}
                  onClose={() => update({ territoryId: null }, { push: true })}
                  onSelectTerritory={(id) =>
                    update({ territoryId: id === 'mg' ? null : id }, { push: true })
                  }
                  onYearRoundChange={(year, round) => update({ year, round })}
                />
              </Suspense>
            }
          />
        </section>
      </div>

      <section
        id="agenda"
        aria-labelledby="agenda-title"
        // Rodada 4b: rendering skipped while far below the fold.
        className="ed-section scroll-mt-(--header-height)"
      >
        <div className="mx-auto grid max-w-(--content-max) grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-x-10">
          <PlateHeading
            number={4}
            kicker="Agenda"
            title="Agenda da campanha"
            id="agenda-title"
            className="lg:col-span-4 lg:self-start"
            lead="Panfletagens, encontros, caminhadas e mutirões da campanha de Lula em Minas, publicados depois de revisão. Horários de Brasília."
          />
          <div className="min-w-0 lg:col-span-8">
            {agendaReady ? (
              <Suspense fallback={<AgendaPlaceholder />}>
                <ActivityAgenda variant="row" />
              </Suspense>
            ) : (
              <AgendaPlaceholder />
            )}
            <p className="mt-5 text-secondary">
              Não encontrou uma atividade perto de você?{' '}
              <Link
                to="/criar-atividade"
                className="inline-flex min-h-11 items-center font-semibold text-primary underline decoration-2 underline-offset-4"
              >
                Proponha uma atividade
              </Link>
            </p>
          </div>
        </div>
      </section>

      <HomeJoinSection
        territoryId={state.territoryId}
        start={interacted || location.hash === '#participar'}
      />
    </>
  );
}
