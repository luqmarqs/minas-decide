import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicActivity } from '@shared/contracts/activities.ts';
import { OFFICE_LABEL_PT, type MapLayerCode } from '@shared/contracts/metrics.ts';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { DARK_QUERY, DESKTOP_QUERY, useMediaQuery } from '@/lib/media';
import { hasWebGL } from '@/lib/webgl';
import { ActivityPopover } from '@/features/activities/ActivityPopover';
import { useActivities } from '@/features/activities/api';
import {
  useCandidates,
  useLayerValues,
  useMunicipalityMetrics,
  usePois,
  useTerritoryIndex,
} from './hooks';
import {
  LAYERS,
  MARGIN_ROUNDS,
  marginFromComparison,
  marginRoundOf,
  pickMetrics,
  pickPresidentComparison,
  PRESIDENT_KEYS,
  PRESIDENT_LABEL,
  valueForLayer,
} from './layers';
import { deriveMobilizationLayer, MOBILIZATION_SIDE_LABEL, sideOf } from './mobilization';
import { PoiPopover } from './PoiPopover';
import type { BasemapProblem } from './MapCanvas';
import { MapLayerSelector } from './MapLayerSelector';
import { MapLegend, StatusBadge } from './MapLegend';
import { TerritoryListFallback, type FallbackReason } from './TerritoryListFallback';
import type { MapUrlState } from './useMapUrlState';
import { SHEET_HALF } from '@/features/territory/sheet';

const MapCanvas = lazy(() => import('./MapCanvas'));

/** Height reserved for the layer selector overlay on mobile (camera padding). */
const MOBILE_TOP_PAD = 140;

export { MAP_ATTRIBUTION, MapAttribution } from './MapAttribution';
import { MapAttribution } from './MapAttribution';

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
  const dark = useMediaQuery(DARK_QUERY);
  const [webglOk] = useState(() => hasWebGL());
  const [mapFailed, setMapFailed] = useState(false);
  const [basemapProblem, setBasemapProblem] = useState<BasemapProblem | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [poiId, setPoiId] = useState<string | null>(null);

  const { index, snapshot, isLoading, error, refetch } = useTerritoryIndex();
  const layer: MapLayerCode = state.layer;
  const meta = LAYERS[layer];
  const president = layer === 'president_comparison';
  const mobilization = layer === 'mobilization';
  const candidatesQ = useCandidates({
    enabled: meta.needsCandidate && !president && !mobilization,
  });
  const latestYear = snapshot ? Math.max(...snapshot.manifest.years) : state.year;
  // The presidential comparison is always 2026 (1st round) against 2022.
  const fixedYear = layer === 'comparison' || president || mobilization || layer === 'blank_null';
  const marginRound = marginRoundOf(state.year, state.round);
  const layerYear =
    layer === 'president_margin' ? marginRound.year : fixedYear ? latestYear : state.year;
  const layerRound = layer === 'president_margin' ? marginRound.round : fixedYear ? 1 : state.round;

  const candidateOptions = useMemo(() => {
    if (mobilization)
      return (['lula', 'bolsonaro'] as const).map((k) => ({
        value: k,
        label: MOBILIZATION_SIDE_LABEL[k],
      }));
    if (president) {
      // Demo snapshot: the slots are synthetic "Candidatura A/B", never real names.
      const demo = snapshot?.mode === 'demo' || snapshot?.status === 'demo';
      return PRESIDENT_KEYS.map((k, i) => ({
        value: k,
        label: demo ? `Candidatura ${i === 0 ? 'A' : 'B'} (demo)` : PRESIDENT_LABEL[k],
      }));
    }
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
  }, [candidatesQ.data, layer, layerYear, latestYear, president, mobilization, snapshot]);

  const candidateId = meta.needsCandidate
    ? candidateOptions.some((o) => o.value === state.candidateId)
      ? state.candidateId
      : (candidateOptions[0]?.value ?? null)
    : null;
  const candidateLabel = candidateOptions.find((o) => o.value === candidateId)?.label ?? null;

  const layerQ = useLayerValues(layer, layerYear, layerRound, candidateId);
  // D27: mobilization = abstention (2026 r1) where the chosen side led (margin layer).
  const mobAbstQ = useLayerValues('abstention', 2026, 1, null, { enabled: mobilization });
  const mobMarginQ = useLayerValues('president_margin', 2026, 1, null, { enabled: mobilization });
  const mobilizationValues = useMemo(
    () =>
      mobilization
        ? deriveMobilizationLayer(mobAbstQ.data, mobMarginQ.data, sideOf(candidateId))
        : null,
    [mobilization, mobAbstQ.data, mobMarginQ.data, candidateId],
  );
  const layerData = mobilization ? mobilizationValues : layerQ.data;
  const layerLoading = mobilization ? mobAbstQ.isLoading || mobMarginQ.isLoading : layerQ.isLoading;
  const selectedMuni = state.territoryId ? municipalityIdOf(state.territoryId) : null;
  const muniMetricsQ = useMunicipalityMetrics(
    selectedMuni && selectedMuni !== 'mg' ? selectedMuni : null,
  );
  const neighborhoodValues = useMemo(() => {
    const file = muniMetricsQ.data;
    if (!file) return null;
    const out: Record<string, number> = {};
    for (const [id, rows] of Object.entries(file.children)) {
      const v =
        layer === 'president_margin'
          ? marginFromComparison(pickPresidentComparison(rows), layerYear, layerRound)
          : valueForLayer(pickMetrics(rows, layerYear, layerRound), layer, candidateId);
      if (v !== null) out[id] = v;
    }
    return out;
  }, [muniMetricsQ.data, layer, layerYear, layerRound, candidateId]);

  const activitiesQ = useActivities({});
  const activities = activitiesOverride ?? activitiesQ.data?.items ?? [];
  const showActivities = state.activities ?? true;
  const showPois = variant === 'full' && (state.pois ?? false);
  const selectedActivity =
    activityId && showActivities ? activities.find((a) => a.id === activityId) : undefined;
  const mappedActivities = activities.filter((a) => a.coordinates && a.status === 'published');
  const poisQ = usePois({ enabled: showPois });
  const pois = poisQ.data?.items ?? null;
  const selectedPoi = poiId && showPois ? pois?.find((x) => x.id === poiId) : undefined;

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
    setPoiId(null);
    onStateChange({ territoryId: id }, { push: true });
  };

  const showPanelSpace = !!panel && desktop && variant === 'full';

  // P-UX-2: measure how much of the map the mobile sheet covers once it has opened (and
  // the page scrolled the map up), so the camera frames the territory in the visible part.
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const [sheetOverlap, setSheetOverlap] = useState(0);
  // Mobile: the layer selector (chips, sub-selection, overlay switches) can be ~250 px tall;
  // measure it so the camera never frames the territory (or a marker) behind it.
  const selectorRef = useRef<HTMLDivElement>(null);
  const [selectorHeight, setSelectorHeight] = useState(MOBILE_TOP_PAD);
  useEffect(() => {
    const el = selectorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setSelectorHeight(h + 16);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  const topPad = variant === 'full' && !desktop ? Math.max(MOBILE_TOP_PAD, selectorHeight) : 72;
  const topPadRef = useRef(topPad);
  useEffect(() => {
    topPadRef.current = topPad;
  });
  const sheetCase = !desktop && variant === 'full' && !!panel && !!state.territoryId;
  useEffect(() => {
    if (!sheetCase) return;
    const measure = () => {
      const box = mapBoxRef.current?.getBoundingClientRect();
      if (!box) return;
      const sheet = document.querySelector('[data-vaul-drawer]')?.getBoundingClientRect();
      const sheetTop = sheet?.top ?? window.innerHeight * (1 - SHEET_HALF);
      const overlap = Math.round(box.bottom - sheetTop);
      // Keep at least ~120 px of map for the territory itself.
      setSheetOverlap(Math.max(0, Math.min(overlap, box.height - topPadRef.current - 120)));
    };
    let t = setTimeout(measure, 500);
    // Deep links open the sheet before the map is scrolled into view: re-measure (debounced)
    // after the page scrolls so the camera re-frames in the part of the map left visible.
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(measure, 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
  }, [sheetCase, state.territoryId]);
  const padding = {
    // Mobile: the measured height of the layer selector at the top of the map.
    top: topPad,
    right: showPanelSpace ? 420 : 0,
    // Mobile: only the part of the map actually covered by the half-open sheet.
    bottom: sheetCase ? sheetOverlap : 0,
  };

  const legend = snapshot ? (
    <MapLegend
      layer={layer}
      values={layerData}
      loading={layerLoading}
      status={snapshot.status}
      releaseId={snapshot.releaseId}
      year={layerYear}
      round={layerRound}
      candidateLabel={candidateLabel}
      showActivities={showActivities}
      activityCount={mappedActivities.length}
      activitiesUnavailable={!!activitiesQ.error && !activitiesOverride}
      activitiesDemo={activitiesQ.data?.demo}
      showPois={showPois}
      poiCount={pois?.length ?? null}
      poiLoading={poisQ.isLoading}
      poiUnavailable={!!poisQ.error || poisQ.data === null}
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
        layerValues={layerData}
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
          key={dark ? 'dark' : 'light'}
          dark={dark}
          index={index}
          selectedId={state.territoryId}
          layer={layer}
          layerValues={layerData}
          neighborhoodValues={neighborhoodValues}
          activities={activities}
          showActivities={showActivities}
          pois={pois}
          showPois={showPois}
          onSelect={select}
          onActivitySelect={(id) => {
            setPoiId(null);
            setActivityId(id);
          }}
          onPoiSelect={(id) => {
            setActivityId(null);
            setPoiId(id);
          }}
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
        ref={mapBoxRef}
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
            <div
              ref={selectorRef}
              className="pointer-events-auto flex w-fit max-w-full flex-col gap-2 rounded-md border border-border bg-surface-raised/95 p-2 shadow-raised backdrop-blur-sm"
            >
              <MapLayerSelector
                layer={layer}
                onLayerChange={(l) => onStateChange({ layer: l })}
                yearRound={`${layerYear}-${layerRound}`}
                yearRoundOptions={yearRoundOptions}
                marginOptions={MARGIN_ROUNDS.map((r) => ({
                  value: `${r.year}-${r.round}`,
                  label: r.label,
                }))}
                onYearRoundChange={(v) => {
                  const [y, r] = v.split('-').map(Number);
                  if (y && r) onStateChange({ year: y, round: r });
                }}
                candidateId={candidateId}
                candidateOptions={candidateOptions}
                onCandidateChange={(id) => onStateChange({ candidateId: id })}
                overlays={{
                  activities: showActivities,
                  onActivitiesChange: (on) => {
                    if (!on) setActivityId(null);
                    onStateChange({ activities: on });
                  },
                  pois: showPois,
                  onPoisChange: (on) => {
                    if (!on) setPoiId(null);
                    onStateChange({ pois: on });
                  },
                }}
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
          <div
            className={cn(
              'pointer-events-none absolute left-0 z-(--z-panel) w-full p-2 sm:p-3 lg:w-auto [&>*]:pointer-events-auto',
              'bottom-0',
            )}
          >
            {legend}
          </div>
        ) : null}

        {selectedActivity || selectedPoi ? (
          <div
            className={cn(
              'absolute inset-x-2 z-(--z-panel) max-h-[calc(100%-1rem)] overflow-y-auto sm:right-auto sm:left-3 sm:w-96',
              // Mobile with the territory sheet open: show it at the top, above the sheet.
              sheetCase ? 'top-2' : 'bottom-2',
            )}
          >
            {selectedActivity ? (
              <ActivityPopover
                key={selectedActivity.id}
                activity={selectedActivity}
                demo={activitiesQ.data?.demo}
                onClose={() => setActivityId(null)}
              />
            ) : selectedPoi ? (
              <PoiPopover
                key={selectedPoi.id}
                poi={selectedPoi}
                municipalityName={
                  selectedPoi.municipality_id
                    ? (index?.byId.get(selectedPoi.municipality_id)?.name ?? null)
                    : null
                }
                onClose={() => setPoiId(null)}
              />
            ) : null}
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
            {meta.scale === 'none' ? '' : ` · ${meta.unit}`} · Fonte: TSE
          </span>
        </p>
      ) : null}
      <MapAttribution className="px-2 py-1" />
    </div>
  );
}
