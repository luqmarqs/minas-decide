import { useNavigate, useParams } from 'react-router';
import { useAfterFirstPaint } from '@/lib/idle';
import { isTerritoryId } from '@/lib/territoryId';
import { DeferredMapShell } from '@/features/electoral-map/DeferredMapShell';
import { useTerritoryIndex } from '@/features/electoral-map/hooks';
import { mapQuery, useMapUrlState } from '@/features/electoral-map/useMapUrlState';
import { TerritoryDetails } from '@/features/territory/TerritoryDetails';
import { territoryLabel } from '@/features/territory/search';
import NotFoundPage from './NotFoundPage';

export default function TerritorioPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, update] = useMapUrlState();
  // Data is requested right after the first contentful frame (P-PERF-1).
  const painted = useAfterFirstPaint();
  const { index } = useTerritoryIndex({ enabled: painted });
  if (!isTerritoryId(id)) return <NotFoundPage />;
  const entry = index?.byId.get(id);
  const go = (tid: string) =>
    navigate(
      tid === 'mg'
        ? `/${mapQuery({ year: state.year, round: state.round })}`
        : `/territorio/${tid}${mapQuery({ year: state.year, round: state.round })}`,
    );

  return (
    // min-height keeps the footer below the fold while data loads (P-PERF-2, CLS).
    <div className="mx-auto grid min-h-[calc(100dvh-var(--header-height))] w-full max-w-(--content-max) content-start gap-6 px-(--gutter) py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:px-6 lg:py-10">
      <title>{`${entry ? territoryLabel(entry) : 'Território'} — Minas Decide`}</title>
      <div className="min-w-0">
        <h1 className="mb-4 text-3xl sm:text-4xl">{entry?.name ?? 'Território'}</h1>
        <TerritoryDetails
          territoryId={id}
          year={state.year}
          round={state.round}
          candidateId={state.candidateId}
          variant="page"
          dataEnabled={painted}
          onYearRoundChange={(year, round) => update({ year, round })}
          onSelectTerritory={go}
        />
      </div>
      <aside aria-label="Mapa do território" className="order-first lg:order-none">
        <div className="h-72 overflow-hidden rounded-card border border-border lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:h-[28rem]">
          <DeferredMapShell
            variant="context"
            className="h-full"
            state={{ ...state, territoryId: id }}
            onStateChange={(patch, opts) => {
              if (patch.territoryId) go(patch.territoryId);
              else if (!('territoryId' in patch)) update(patch, opts);
            }}
          />
        </div>
      </aside>
    </div>
  );
}
