import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import type { PublicActivity } from '@shared/contracts/activities.ts';
import { OFFICE_LABEL_PT, type MapLayerCode } from '@shared/contracts/metrics.ts';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/media';
import { hasWebGL } from '@/lib/webgl';
import { ActivityCard } from '@/features/activities/ActivityCard';
import { useActivities } from '@/features/activities/api';
import { useCandidates, useLayerValues, useMunicipalityMetrics, useTerritoryIndex } from './hooks';
import { LAYERS, pickMetrics, valueForLayer } from './layers';
import type { BasemapProblem } from './MapCanvas';
import { MapLayerSelector } from './MapLayerSelector';
import { MapLegend, StatusBadge } from './MapLegend';
import { TerritoryListFallback, type FallbackReason } from './TerritoryListFallback';
import type { MapUrlState } from './useMapUrlState';

const MapCanvas = lazy(() => import('./MapCanvas'));

export const MAP_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles Dados © OpenStreetMap contributors';

export interface MapShellProps {
  state: MapUrlState;
  onStateChange: (patch: Partial<MapUrlState>, opts?: { push?: boolean }) => void;
  /** Contextual panel (desktop side panel / mobile sheet). */
  panel?: ReactNode;
  /** 'full' = home explorer; 'context' = small embedded map (territory/activity pages). */
  variant?: 'full' | 'context';
  /** Override activities shown (e.g. the single activity on its page). */
  activitiesOverride?: PublicActivity[];
  className?: string;
}

export function MapAttribution({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted', className)}>
      <a
        href="https://openfreemap.org"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        © OpenFreeMap
      </a>{' '}
      <a
        href="https://www.openmaptiles.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        © OpenMapTiles
      </a>{' '}
      Dados{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        © OpenStreetMap contributors
      </a>{' '}
      · Malha municipal: IBGE
    </p>
  );
}

/**
 * Map container: decides between the WebGL map (lazy) and the list fallback,
 * loads layer data, and lays out selector, legend, panel and attribution.
 */
export function MapShell({
  state,
  onStateChange,
  panel,
  variant = 'full',
  activitiesOverride,
  className,
}: MapShellProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [webglOk] = useState(() => hasWebGL());
  const [mapFailed, setMapFailed] = useState(false);
  const [basemapProblem, setBasemapProblem] = useState<BasemapProblem | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);

  const { index, snapshot, isLoading, error, refetch } = useTerritoryIndex();
  const candidatesQ = useCandidates();
  const latestYear = snapshot ? Math.max(...snapshot.manifest.years) : state.year;

  const layer: MapLayerCode = state.layer;
  const meta = LAYERS[layer];
  const layerYear = layer === 'comparison' ? latestYear : state.year;
  const layerRound = layer === 'comparison' ? 1 : state.round;

  const candidateOptions = useMemo(() => {
    const items = candidatesQ.data?.items ?? [];
    const officeRank = {
      governor: 0,
      president: 1,
      senator: 2,
      federal_deputy: 3,
      state_deputy: 4,
    } as const;
    return items
      .filter((c) =>
        layer === 'comparison'
          ? c.year === latestYear && c.has_history
          : c.year === layerYear && c.has_layer,
      )
      .sort(
        (a, b) =>
          officeRank[a.office] - officeRank[b.office] ||
          a.ballot_name.localeCompare(b.ballot_name, 'pt-BR'),
      )
      .map((c) => ({
        value: c.candidate_id,
        label: `${c.ballot_name} (${c.party}) · ${OFFICE_LABEL_PT[c.office]}`,
      }));
  }, [candidatesQ.data, layer, layerYear, latestYear]);

  const candidateId = meta.needsCandidate
    ? candidateOptions.some((o) => o.value === state.candidateId)
      ? state.candidateId
      : (candidateOptions[0]?.value ?? null)
    : null;
  const candidateLabel = candidateOptions.find((o) => o.value === candidateId)?.label ?? null;

  const layerQ = useLayerValues(layer, layerYear, layerRound, candidateId);
  const selectedMuni = state.territoryId ? municipalityIdOf(state.territoryId) : null;
  const muniMetricsQ = useMunicipalityMetrics(
    selectedMuni && selectedMuni !== 'mg' ? selectedMuni : null,
  );
  const neighborhoodValues = useMemo(() => {
    const file = muniMetricsQ.data;
    if (!file) return null;
    const out: Record<string, number> = {};
    for (const [id, rows] of Object.entries(file.children)) {
      const v = valueForLayer(pickMetrics(rows, layerYear, layerRound), layer, candidateId);
      if (v !== null) out[id] = v;
    }
    return out;
  }, [muniMetricsQ.data, layer, layerYear, layerRound, candidateId]);

  const activitiesQ = useActivities({});
  const activities = activitiesOverride ?? activitiesQ.data?.items ?? [];
  const selectedActivity = activityId ? activities.find((a) => a.id === activityId) : undefined;

  const yearRoundOptions = useMemo(() => {
    const years = [...(snapshot?.manifest.years ?? [state.year])].sort((a, b) => b - a);
    const rounds = [...(snapshot?.manifest.rounds ?? [1])].sort();
    return years.flatMap((y) =>
      rounds.map((r) => ({ value: `${y}-${r}`, label: `${y} · ${r}º turno` })),
    );
  }, [snapshot, state.year]);

  const fallbackReason: FallbackReason | null = !webglOk
    ? 'no-webgl'
    : mapFailed
      ? 'map-error'
      : state.view === 'lista'
        ? 'user'
        : null;

  const select = (id: string | null) => {
    setActivityId(null);
    onStateChange({ territoryId: id }, { push: true });
  };

  const showPanelSpace = !!panel && desktop && variant === 'full';
  const padding = {
    right: showPanelSpace ? 420 : 0,
    bottom: !desktop && state.territoryId && variant === 'full' ? 260 : 0,
  };

  const legend = snapshot ? (
    <MapLegend
      layer={layer}
      values={layerQ.data}
      loading={layerQ.isLoading}
      status={snapshot.status}
      releaseId={snapshot.releaseId}
      year={layerYear}
      round={layerRound}
      candidateLabel={candidateLabel}
      activityCount={activities.filter((a) => a.coordinates && a.status === 'published').length}
      activitiesUnavailable={!!activitiesQ.error && !activitiesOverride}
      activitiesDemo={activitiesQ.data?.demo}
      defaultCollapsed={!desktop || variant === 'context'}
    />
  ) : null;

  let body: ReactNode;
  if (isLoading || !snapshot) {
    body = (
      <div className="grid h-full place-items-center" role="status">
        <span className="flex items-center gap-2 text-secondary">
          <Spinner /> Carregando mapa e territórios…
        </span>
      </div>
    );
  } else if (error && !index) {
    body = (
      <div className="p-4">
        <ErrorState
          title="Territórios indisponíveis"
          message="Não foi possível carregar o índice de territórios do snapshot."
          onRetry={() => void refetch()}
        />
      </div>
    );
  } else if (index && fallbackReason) {
    body = (
      <TerritoryListFallback
        index={index}
        layer={layer}
        layerValues={layerQ.data}
        neighborhoodValues={neighborhoodValues}
        selectedId={state.territoryId}
        onSelect={select}
        reason={fallbackReason}
        legend={legend}
        onBackToMap={fallbackReason === 'user' ? () => onStateChange({ view: 'mapa' }) : undefined}
        className={cn(
          showPanelSpace && 'lg:pr-[calc(var(--panel-width)+2.5rem)]',
          variant === 'full' && 'pt-32 lg:pt-28',
        )}
      />
    );
  } else if (index) {
    body = (
      <Suspense
        fallback={
          <div className="grid h-full place-items-center" role="status">
            <span className="flex items-center gap-2 text-secondary">
              <Spinner /> Carregando mapa…
            </span>
          </div>
        }
      >
        <MapCanvas
          index={index}
          selectedId={state.territoryId}
          layer={layer}
          layerValues={layerQ.data}
          neighborhoodValues={neighborhoodValues}
          activities={activities}
          onSelect={select}
          onActivitySelect={setActivityId}
          onFatalError={() => setMapFailed(true)}
          onBasemapProblem={setBasemapProblem}
          padding={padding}
        />
      </Suspense>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden bg-surface-alt',
          showPanelSpace && 'mm-map-has-panel',
        )}
      >
        {body}

        {variant === 'full' && snapshot ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-(--z-panel) p-2 sm:p-3',
              showPanelSpace && 'right-(--panel-width) pr-6',
            )}
          >
            <div className="pointer-events-auto flex w-fit max-w-full flex-col gap-2 rounded-md border border-border bg-surface-raised/95 p-2 shadow-raised backdrop-blur-sm">
              <MapLayerSelector
                layer={layer}
                onLayerChange={(l) => onStateChange({ layer: l })}
                yearRound={`${state.year}-${state.round}`}
                yearRoundOptions={yearRoundOptions}
                onYearRoundChange={(v) => {
                  const [y, r] = v.split('-').map(Number);
                  if (y && r) onStateChange({ year: y, round: r });
                }}
                candidateId={candidateId}
                candidateOptions={candidateOptions}
                onCandidateChange={(id) => onStateChange({ candidateId: id })}
                trailing={
                  webglOk && !mapFailed ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconBefore={
                          <Icon name={state.view === 'lista' ? 'map' : 'list'} size={18} />
                        }
                        onClick={() =>
                          onStateChange({ view: state.view === 'lista' ? 'mapa' : 'lista' })
                        }
                      >
                        {state.view === 'lista' ? 'Ver mapa' : 'Ver como lista'}
                      </Button>
                      {basemapProblem ? (
                        <p role="status" className="text-xs text-warning">
                          Mapa de fundo indisponível; dados e contornos continuam visíveis.
                        </p>
                      ) : null}
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        ) : null}

        {snapshot && !fallbackReason && variant === 'full' ? (
          <div className="pointer-events-none absolute bottom-0 left-0 z-(--z-panel) w-full p-2 sm:p-3 lg:w-auto [&>*]:pointer-events-auto">
            {legend}
          </div>
        ) : null}

        {selectedActivity ? (
          <div className="absolute inset-x-2 bottom-2 z-(--z-panel) sm:right-auto sm:left-3 sm:w-96">
            <div className="relative">
              <ActivityCard
                activity={selectedActivity}
                demo={activitiesQ.data?.demo}
                className="shadow-raised"
              />
              <button
                type="button"
                className="absolute top-1 right-1 z-10 grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
                aria-label="Fechar atividade"
                onClick={() => setActivityId(null)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>
        ) : null}

        {panel && variant === 'full' && desktop ? (
          <div className="pointer-events-none absolute top-3 right-3 bottom-3 z-(--z-panel) flex flex-col">
            <div className="pointer-events-auto flex max-h-full">{panel}</div>
          </div>
        ) : null}
      </div>
      {/* Mobile: the panel renders a portalled bottom sheet. */}
      {panel && variant === 'full' && !desktop ? panel : null}
      {snapshot && variant === 'context' ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-2 py-1 text-xs text-secondary">
          <StatusBadge status={snapshot.status} />
          <span>
            {meta.label}
            {layer === 'activities' ? '' : ` · ${meta.unit}`} · snapshot{' '}
            <span className="font-mono">{snapshot.releaseId}</span>
          </span>
        </p>
      ) : null}
      <MapAttribution className="px-2 py-1" />
    </div>
  );
}
