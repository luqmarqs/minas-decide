import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { ActivityAgenda } from '@/features/activities/ActivityAgenda';
import { StatusBadge } from '@/features/electoral-map/MapLegend';
import { MapShell } from '@/features/electoral-map/MapShell';
import { useSnapshot } from '@/features/electoral-map/hooks';
import { useMapUrlState } from '@/features/electoral-map/useMapUrlState';
import { TerritoryPanel } from '@/features/territory/TerritoryPanel';
import { TerritorySearch } from '@/features/territory/TerritorySearch';

const SEARCH_ID = 'busca-territorio';

/** Home (spec §12.5): identity+CTA → short message → search → map+layers → panel → agenda → footer. */
export default function HomePage() {
  const [state, update] = useMapUrlState();
  const { data: snap } = useSnapshot();
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#busca') document.getElementById(SEARCH_ID)?.focus();
    if (location.hash === '#agenda') document.getElementById('agenda')?.scrollIntoView();
  }, [location.hash, location.key]);

  return (
    <>
      <title>Minas em Movimento — atlas eleitoral e agenda de Minas Gerais</title>
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
                <StatusBadge status="demo" />
                Snapshot oficial ainda não publicado: os números abaixo são sintéticos.
              </p>
            ) : null}
          </div>
          <TerritorySearch
            id={SEARCH_ID}
            size="lg"
            className="w-full lg:max-w-md"
            onSelect={(e) => update({ territoryId: e.id, view: state.view }, { push: true })}
          />
        </div>
      </section>

      <section
        aria-label="Mapa de Minas Gerais"
        className="h-[72dvh] min-h-[440px] lg:h-[calc(100dvh-var(--header-height)-10rem)] lg:min-h-[560px]"
      >
        <MapShell
          className="h-full"
          state={state}
          onStateChange={update}
          panel={
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
          }
        />
      </section>

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
            <ActivityAgenda />
          </div>
        </div>
      </section>
    </>
  );
}
