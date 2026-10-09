import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
  useMunicipalitiesMetrics,
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
import { MapControlBar } from './MapControlBar';
import { MapLayerSelector } from './MapLayerSelector';
import { MapLegend, MapLegendChip, StatusBadge } from './MapLegend';
import { TerritoryListFallback, type FallbackReason } from './TerritoryListFallback';
import type { MapUrlState } from './useMapUrlState';
import { cameraPadding, sheetOverlap } from './viewport';
import { useSheetHeight } from '@/features/territory/sheet';

const MapCanvas = lazy(() => import('./MapCanvas'));

export { MAP_ATTRIBUTION, MapAttribution } from './MapAttribution';
import { MapAttribution, MapAttributionCompact } from './MapAttribution';

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
  // Municipalities whose neighborhood areas the map draws (selected + on screen from zoom
  // 10, FE-10): their metrics colour the areas by the active layer.
  const [areaMunis, setAreaMunis] = useState<string[]>([]);
  const metricsIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedMuni && selectedMuni !== 'mg') ids.add(selectedMuni);
    for (const id of areaMunis) ids.add(id);
    return [...ids];
  }, [selectedMuni, areaMunis]);
  const metricsFiles = useMunicipalitiesMetrics(metricsIds);
  const neighborhoodValues = useMemo(() => {
    const out: Record<string, number> = {};
    let any = false;
    for (const file of metricsFiles) {
      if (!file) continue;
      any = true;
      for (const [id, rows] of Object.entries(file.children)) {
        const v =
          layer === 'president_margin'
            ? marginFromComparison(pickPresidentComparison(rows), layerYear, layerRound)
            : valueForLayer(pickMetrics(rows, layerYear, layerRound), layer, candidateId);
        if (v !== null) out[id] = v;
      }
    }
    return any ? out : null;
  }, [metricsFiles, layer, layerYear, layerRound, candidateId]);

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

  // FE-10 (phones): compact bar on top, collapsed sheet at the bottom. Measure the bar and
  // the part of the map the fixed sheet covers, so the camera frames the territory — and
  // the legend chip / popovers sit — in the map that is actually visible.
  const compact = !desktop && variant === 'full';
  const sheetHeight = useSheetHeight();
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [barBottom, setBarBottom] = useState(64);
  const [mapHeight, setMapHeight] = useState(0);
  useEffect(() => {
    const box = mapBoxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const top = box.getBoundingClientRect().top;
      setMapHeight(Math.round(box.getBoundingClientRect().height));
      const bar = barRef.current?.getBoundingClientRect();
      if (bar && bar.height > 0) setBarBottom(Math.round(bar.bottom - top));
    });
    ro.observe(box);
    if (barRef.current) ro.observe(barRef.current);
    return () => ro.disconnect();
  }, [compact, snapshot]);
  const sheetCase = compact && !!panel && !!state.territoryId;
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (!sheetCase || sheetHeight <= 0) return;
    const measure = () => {
      const box = mapBoxRef.current?.getBoundingClientRect();
      // Map off screen (deep link before scrolling): keep the last value.
      if (!box || box.top >= window.innerHeight || box.bottom <= 0) return;
      setOverlap(
        sheetOverlap({
          mapTop: box.top,
          mapBottom: box.bottom,
          viewportHeight: window.innerHeight,
          sheetHeight,
          topInset: barBottom,
        }),
      );
    };
    measure();
    // Re-measure (debounced) after the page scrolls the map into view.
    let t: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(t);
      t = setTimeout(measure, 150);
    };
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
    };
  }, [sheetCase, sheetHeight, barBottom, state.territoryId]);
  const bottomInset = sheetCase && sheetHeight > 0 ? overlap : 0;
  const padding = cameraPadding({
    compact,
    barBottom,
    overlap: bottomInset,
    panelRight: showPanelSpace ? 420 : 0,
  });
  // Popovers never grow over the bar nor under the sheet.
  const popoverMax = Math.max(160, mapHeight - barBottom - bottomInset - 24);

  const setActivities = (on: boolean) => {
    if (!on) setActivityId(null);
    onStateChange({ activities: on });
  };
  const setPois = (on: boolean) => {
    if (!on) setPoiId(null);
    onStateChange({ pois: on });
  };
  // Qualifier shown in the compact bar ("2026 · 1º turno", candidate, Lula/Bolsonaro…).
  // Short on screen ("2026 · 1º"); "turno" stays in the accessible name.
  const yearRoundShort = (
    <>
      {layerYear} · {layerRound}º<span className="sr-only"> turno</span>
    </>
  );
  const layerDetail =
    meta.needsCandidate && candidateLabel
      ? candidateLabel.split(' · ')[0]!
      : (meta.scale === 'sequential' && !fixedYear) || layer === 'president_margin'
        ? yearRoundShort
        : null;
  const renderSelector = (inPopover: boolean) => (
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
      overlays={
        inPopover
          ? undefined
          : {
              activities: showActivities,
              onActivitiesChange: setActivities,
              pois: showPois,
              onPoisChange: setPois,
            }
      }
      wrapChips={inPopover}
      trailing={
        !inPopover && webglOk && !mapFailed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              iconBefore={<Icon name={state.view === 'lista' ? 'map' : 'list'} size={18} />}
              onClick={() => onStateChange({ view: state.view === 'lista' ? 'mapa' : 'lista' })}
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
  );

  const renderLegend = (defaultCollapsed: boolean, className?: string) =>
    snapshot ? (
      <MapLegend
        className={className}
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
        defaultCollapsed={defaultCollapsed}
      />
    ) : null;
  const legend = renderLegend(!desktop || variant === 'context');
  // Phones: the full legend (details open) inside the chip's popover.
  const legendFull = renderLegend(
    false,
    'max-w-none rounded-none border-0 bg-transparent shadow-none backdrop-blur-none',
  );

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
          variant === 'full' && 'pt-16 lg:pt-28',
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
          onAreaMunicipalitiesChange={setAreaMunis}
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
          'mm-map-box relative min-h-0 flex-1 overflow-hidden bg-surface-alt',
          showPanelSpace && 'mm-map-has-panel',
        )}
        style={{ '--mm-bottom-inset': `${bottomInset}px` } as CSSProperties}
      >
        {body}

        {variant === 'full' && snapshot && compact ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-(--z-panel) p-2 [&>*]:pointer-events-auto">
            <MapControlBar
              ref={barRef}
              layerLabel={meta.label}
              layerDetail={layerDetail}
              selector={renderSelector(true)}
              activities={showActivities}
              onActivitiesChange={setActivities}
              pois={showPois}
              onPoisChange={setPois}
              listMode={
                webglOk && !mapFailed
                  ? {
                      list: state.view === 'lista',
                      onToggle: () =>
                        onStateChange({ view: state.view === 'lista' ? 'mapa' : 'lista' }),
                    }
                  : null
              }
              popoverMaxHeight={popoverMax}
            />
            {basemapProblem ? (
              <p
                role="status"
                className="mt-1 w-fit rounded-sm bg-surface-raised/95 px-2 py-1 text-xs text-warning"
              >
                Mapa de fundo indisponível; dados e contornos continuam visíveis.
              </p>
            ) : null}
          </div>
        ) : variant === 'full' && snapshot ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-(--z-panel) p-2 sm:p-3',
              showPanelSpace && 'right-(--panel-width) pr-6',
            )}
          >
            <div className="pointer-events-auto flex w-fit max-w-full flex-col gap-2 rounded-md border border-border bg-surface-raised/95 p-2 shadow-raised backdrop-blur-sm">
              {renderSelector(false)}
            </div>
          </div>
        ) : null}

        {snapshot && !fallbackReason && variant === 'full' && compact ? (
          <div
            className="pointer-events-none absolute right-0 left-0 z-(--z-panel) flex items-end justify-between gap-2 p-2 [&>*]:pointer-events-auto"
            style={{ bottom: bottomInset }}
          >
            <MapLegendChip
              layer={layer}
              values={layerData}
              status={snapshot.status}
              maxHeight={popoverMax}
              className="min-w-0"
            >
              {legendFull}
            </MapLegendChip>
            <MapAttributionCompact className="mr-10 shrink-0" />
          </div>
        ) : snapshot && !fallbackReason && variant === 'full' ? (
          <div className="pointer-events-none absolute bottom-0 left-0 z-(--z-panel) w-full p-2 sm:p-3 lg:w-auto [&>*]:pointer-events-auto">
            {legend}
          </div>
        ) : null}

        {selectedActivity || selectedPoi ? (
          <div
            className={cn(
              'absolute z-(--z-panel) overflow-y-auto overscroll-contain',
              compact
                ? 'inset-x-2'
                : 'inset-x-2 bottom-2 max-h-[calc(100%-1rem)] sm:right-auto sm:left-3 sm:w-96',
            )}
            // Phones: anchored to the bottom of the free map, right above the sheet.
            style={compact ? { bottom: bottomInset + 8, maxHeight: popoverMax } : undefined}
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
      <MapAttribution
        className={cn(
          'px-2 py-1',
          variant === 'full' && 'max-lg:hidden',
          compact && fallbackReason && 'max-lg:block',
        )}
      />
    </div>
  );
}
