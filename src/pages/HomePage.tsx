import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { BrandHero } from '@/components/brand/BrandHero';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { useBrandActive } from '@/lib/brand';
import { useAfterIdle } from '@/lib/idle';
import { DESKTOP_QUERY, prefersReducedMotion } from '@/lib/media';
import { DeferredMapShell } from '@/features/electoral-map/DeferredMapShell';
import { useSnapshot } from '@/features/electoral-map/hooks';
import { SNAPSHOT_STATUS_LABEL } from '@/features/electoral-map/snapshotStatus';
import { useMapUrlState } from '@/features/electoral-map/useMapUrlState';
import { TerritorySearch } from '@/features/territory/TerritorySearch';

// Heavy parts (Zod contracts, API client, details panel, vaul) load after idle.
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

/** Home (spec §12.5): identity+CTA → short message → search → map+layers → panel → agenda → footer. */
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
  }, [location.hash, location.key]);

  const search = (
    <TerritorySearch
      id={SEARCH_ID}
      size="lg"
      className="w-full"
      onSelect={(e) => {
        setInteracted(true);
        update({ territoryId: e.id, view: state.view }, { push: true });
        // Mobile: bring the map up so the half-open sheet leaves it visible (P-UX-2).
        if (!window.matchMedia?.(DESKTOP_QUERY).matches) {
          mapSectionRef.current?.scrollIntoView?.({
            block: 'start',
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          });
        }
      }}
    />
  );

  return (
    <>
      <title>Minas Decide — atlas eleitoral e agenda de Minas Gerais</title>
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

        <section
          ref={mapSectionRef}
          aria-label="Mapa de Minas Gerais"
          className={
            brand
              ? 'h-[72dvh] min-h-[440px] scroll-mt-(--header-height) lg:h-[calc(100dvh-var(--header-height)-1px)] lg:min-h-[560px]'
              : 'h-[72dvh] min-h-[440px] scroll-mt-(--header-height) lg:h-auto lg:min-h-[560px] lg:flex-1'
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
        className="scroll-mt-(--header-height) px-(--gutter) py-10 lg:px-6"
      >
        <div className="mx-auto max-w-(--content-max)">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="agenda-title" className="text-2xl">
                Agenda de atividades
              </h2>
              <p className="text-secondary">
                Encontros, caminhadas e mutirões abertos, publicados depois de revisão. Horários de
                Brasília.
              </p>
            </div>
            <ButtonLink to="/criar-atividade" variant="secondary" size="sm">
              Organizar uma atividade
            </ButtonLink>
          </div>
          <div className="max-w-3xl">
            {agendaReady ? (
              <Suspense fallback={<AgendaPlaceholder />}>
                <ActivityAgenda />
              </Suspense>
            ) : (
              <AgendaPlaceholder />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
