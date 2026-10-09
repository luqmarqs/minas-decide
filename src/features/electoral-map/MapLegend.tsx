import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { MapLayerCode, MapLayerValues, SnapshotStatus } from '@shared/contracts/metrics.ts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { ActivityMarker } from '@/features/activities/ActivityMarker';
import { formatLayerValue, LAYERS } from './layers';
import { MARGIN_GRADIENT, safeDomain } from './palette';
import { PoiMarker } from './PoiMarker';
import { SNAPSHOT_STATUS_LABEL } from './snapshotStatus';
import { legendChipText, legendGradient } from './legendText';
import { useDismiss } from './useDismiss';

export interface MapLegendProps {
  layer: MapLayerCode;
  values: MapLayerValues | null | undefined;
  loading?: boolean;
  status: SnapshotStatus;
  releaseId: string;
  year: number;
  round: number;
  candidateLabel?: string | null;
  /** Activities overlay (rodada 3: on by default, over any statistical layer). */
  showActivities?: boolean;
  activityCount?: number;
  activitiesUnavailable?: boolean;
  activitiesDemo?: boolean;
  /** Terminals overlay (OSM). */
  showPois?: boolean;
  poiCount?: number | null;
  poiLoading?: boolean;
  poiUnavailable?: boolean;
  className?: string;
  /** Start collapsed (mobile). */
  defaultCollapsed?: boolean;
}

export function StatusBadge({ status }: { status: SnapshotStatus }) {
  return (
    <Badge variant={status === 'demo' ? 'demo' : status === 'partial' ? 'warning' : 'success'}>
      {SNAPSHOT_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * Legend: always unit, denominator, source/version and snapshot status
 * (spec §12.3, cartography rules). Colour ramps come from --map-* tokens. The footer
 * explains the overlay markers (activities, terminals) that sit on top of any layer.
 */
export function MapLegend({
  layer,
  values,
  loading,
  status,
  releaseId: _releaseId,
  year,
  round,
  candidateLabel,
  showActivities = true,
  activityCount,
  activitiesUnavailable,
  activitiesDemo,
  showPois = false,
  poiCount,
  poiLoading,
  poiUnavailable,
  className,
  defaultCollapsed = false,
}: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const meta = LAYERS[layer];
  const statistical = meta.scale !== 'none';
  const diverging = meta.scale === 'diverging';
  const president = layer === 'president_comparison';
  const margin = layer === 'president_margin';
  const mobilization = layer === 'mobilization';
  const mobSide = values?.candidate_id === 'bolsonaro' ? 'bolsonaro' : 'lula';
  const domain = values ? safeDomain(values.domain, diverging) : null;
  const gradient = margin
    ? MARGIN_GRADIENT
    : diverging
      ? 'linear-gradient(to right, var(--map-diverging-neg), var(--map-diverging-zero), var(--map-diverging-pos))'
      : 'linear-gradient(to right, var(--map-fill-low), var(--map-fill-mid-low), var(--map-fill-mid), var(--map-fill-mid-high), var(--map-fill-high))';

  return (
    <section
      aria-label="Legenda do mapa"
      className={cn(
        'w-full max-w-80 rounded-md border border-border bg-surface-raised/95 p-3 text-primary shadow-raised backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {meta.label}
            {candidateLabel && meta.needsCandidate && !mobilization ? ` · ${candidateLabel}` : ''}
          </p>
          <p className="text-xs text-muted">
            {president || layer === 'comparison'
              ? 'Variação 2022 → 2026, 1º turno'
              : mobilization
                ? '2026 · 1º turno · abstenção onde ' +
                  (mobSide === 'lula' ? 'Lula' : 'Bolsonaro') +
                  ' liderou'
                : margin
                  ? `Margem de Lula sobre Bolsonaro · ${year} · ${round}º turno`
                  : !statistical
                    ? 'Agenda pública'
                    : `${year} · ${round}º turno`}
          </p>
        </div>
        <button
          type="button"
          className="-m-2 grid size-11 shrink-0 place-items-center rounded-md text-secondary hover:bg-surface-alt"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Mostrar detalhes da legenda' : 'Ocultar detalhes da legenda'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <Icon
            name="chevronDown"
            size={18}
            className={cn(
              'transition-transform duration-(--duration-fast)',
              !collapsed && 'rotate-180',
            )}
          />
        </button>
      </div>

      <div className="mt-2">
        <StatusBadge status={status} />
      </div>

      {statistical ? (
        <div className="mt-2" aria-busy={loading || undefined}>
          {values && domain ? (
            <>
              <div
                className="h-3 rounded-pill"
                style={{ backgroundImage: gradient }}
                aria-hidden="true"
              />
              <div className="mt-1 flex justify-between text-xs tabular-nums text-secondary">
                <span>{formatLayerValue(layer, domain[0])}</span>
                {diverging ? <span>0 p.p.</span> : null}
                <span>{formatLayerValue(layer, domain[1])}</span>
              </div>
              {margin ? (
                <p className="mt-0.5 flex justify-between text-xs text-muted">
                  <span>{year === 2022 ? 'Jair Bolsonaro' : 'Flávio Bolsonaro'} à frente</span>
                  <span>Lula à frente</span>
                </p>
              ) : diverging ? (
                <p className="mt-0.5 flex justify-between text-xs text-muted">
                  <span>perdeu participação</span>
                  <span>ganhou participação</span>
                </p>
              ) : null}
              <p className="mt-1 flex items-center gap-2 text-xs text-secondary">
                <span
                  className="inline-block size-3 rounded-sm border border-border-strong bg-(--map-fill-none)"
                  aria-hidden="true"
                />{' '}
                {mobilization
                  ? `${mobSide === 'lula' ? 'Bolsonaro' : 'Lula'} liderou — fora do recorte`
                  : 'sem dado'}
                <span
                  className="mm-selected-swatch inline-block size-3 rounded-full border-2 border-(--map-selected)"
                  aria-hidden="true"
                />{' '}
                selecionado
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">
              {loading
                ? 'Carregando valores…'
                : meta.needsCandidate && !candidateLabel
                  ? 'Escolha uma candidatura para colorir o mapa.'
                  : president || margin
                    ? 'Camada Lula × Bolsonaro ainda não publicada para este turno neste snapshot.'
                    : 'Camada indisponível para esta seleção no snapshot atual.'}
            </p>
          )}
        </div>
      ) : null}

      {showActivities || showPois ? (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2 text-xs text-secondary">
          {showActivities ? (
            <div data-testid="legend-activities">
              <p className="flex items-center gap-2 text-sm text-primary">
                <ActivityMarker size={10} /> Atividade da campanha
                {activitiesDemo ? <Badge variant="demo">Demo</Badge> : null}
              </p>
              <p className={collapsed && activityCount ? 'sr-only' : undefined}>
                {activitiesUnavailable ? (
                  'Agenda indisponível no momento.'
                ) : activityCount ? (
                  `O sol marca atividades publicadas (${formatInt(activityCount)} no mapa); números agrupam atividades próximas. Toque para ver e marcar “Eu vou”.`
                ) : (
                  <>
                    Nenhuma atividade publicada no mapa ainda.{' '}
                    <Link to="/criar-atividade" className="font-semibold underline">
                      Propor atividade
                    </Link>
                  </>
                )}
              </p>
            </div>
          ) : null}
          {showPois ? (
            <div data-testid="legend-pois">
              <p className="flex items-center gap-2 text-sm text-primary">
                <PoiMarker size={11} /> Terminal ou estação
              </p>
              <p className={collapsed ? 'sr-only' : undefined}>
                {poiLoading
                  ? 'Carregando locais…'
                  : poiUnavailable
                    ? 'Locais de grande circulação indisponíveis no momento.'
                    : `${formatInt(poiCount ?? 0)} locais de grande circulação (não são dados eleitorais).`}
              </p>
              <p>© OpenStreetMap contributors (ODbL)</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!collapsed ? (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-xs text-secondary">
          {statistical ? (
            <>
              <p>
                <span className="font-semibold">Unidade:</span> {meta.unit}
              </p>
              <p>
                <span className="font-semibold">Cálculo:</span> {meta.denominator}
              </p>
            </>
          ) : null}
          {mobilization ? (
            <p data-testid="legend-mobilization-note">
              % do eleitorado apto que não votou, apenas em territórios onde{' '}
              {mobSide === 'lula' ? 'Lula' : 'Bolsonaro'} liderou no 1º turno de 2026. Priorização
              territorial de comparecimento, não inferência sobre pessoas.
            </p>
          ) : null}
          {margin ? (
            <p>
              Cores de campanha só nesta camada (vermelho: margem de Lula; azul: margem de
              Bolsonaro). Margem em p.p. dos votos válidos para Presidente.
            </p>
          ) : null}
          {president ? (
            <>
              <p>
                Lula nos dois anos; Bolsonaro = Jair Bolsonaro em 2022 e Flávio Bolsonaro em 2026.
              </p>
              <p>
                <strong>Variação não implica transferência de votos.</strong>
              </p>
            </>
          ) : null}
          {statistical ? (
            <p data-testid="legend-neighborhood-note">
              Bairros: áreas aproximadas pelos locais de votação (Voronoi), não são limites oficiais
              (pontos onde não há área).
            </p>
          ) : null}
          <p>
            <span className="font-semibold">Fonte:</span> {legendSource(layer)} ·{' '}
            <Link to="/metodologia" className="inline-flex min-h-6 items-center underline">
              metodologia
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** D32: short source in the legend ("TSE · IBGE"); provenance only on /metodologia. */
function legendSource(layer: MapLayerCode): string {
  if (layer === 'pois') return 'OpenStreetMap';
  if (LAYERS[layer].scale === 'none') return 'TSE';
  return 'TSE · IBGE';
}

export interface MapLegendChipProps {
  layer: MapLayerCode;
  values: MapLayerValues | null | undefined;
  status: SnapshotStatus;
  /** The full legend (MapLegend, expanded) shown in the popover. */
  children: ReactNode;
  /** Max height of the popover (px). */
  maxHeight?: number;
  className?: string;
}

/**
 * Phone legend (FE-10): collapsed by default into a chip in the bottom-left corner of the
 * map ("Abstenção · 14% – 40%", gradient swatch, snapshot status when not validated —
 * DEMO is always visible). Tapping it opens the full legend in a non-modal popover
 * (light-dismiss: tap outside, Esc or the close button).
 */
export function MapLegendChip({
  layer,
  values,
  status,
  children,
  maxHeight,
  className,
}: MapLegendChipProps) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  };
  useDismiss(popRef, close, { enabled: open, ignore: btnRef });
  useEffect(() => {
    if (open) popRef.current?.focus({ preventScroll: true });
  }, [open]);
  const statistical = LAYERS[layer].scale !== 'none';
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {open ? (
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-modal="false"
          aria-label="Legenda completa do mapa"
          tabIndex={-1}
          data-testid="legend-popover"
          style={maxHeight ? { maxHeight } : undefined}
          className="flex w-full max-w-80 flex-col overflow-y-auto overscroll-contain rounded-md border border-border bg-surface-raised/95 shadow-raised outline-none focus-visible:outline-3 focus-visible:outline-focus"
        >
          {children}
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 border-t border-border text-sm font-semibold text-primary hover:bg-surface-alt"
          >
            <Icon name="close" size={16} /> Fechar legenda
          </button>
        </div>
      ) : null}
      <button
        ref={btnRef}
        type="button"
        data-testid="legend-chip"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-haspopup="dialog"
        aria-label={`Legenda: ${legendChipText(layer, values)}. ${SNAPSHOT_STATUS_LABEL[status]}. Toque para ver a legenda completa`}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-pill border border-border bg-surface-raised/95 px-3 text-sm text-primary shadow-raised backdrop-blur-sm"
      >
        {statistical ? (
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-8 shrink-0 rounded-pill"
            style={{ backgroundImage: legendGradient(layer) }}
          />
        ) : (
          <Icon name="info" size={16} className="shrink-0 text-secondary" />
        )}
        <span className="min-w-0 truncate font-medium tabular-nums">
          {legendChipText(layer, values)}
        </span>
        {status !== 'validated' ? <StatusBadge status={status} /> : null}
      </button>
    </div>
  );
}
