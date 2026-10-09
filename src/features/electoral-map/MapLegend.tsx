import { useState } from 'react';
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
