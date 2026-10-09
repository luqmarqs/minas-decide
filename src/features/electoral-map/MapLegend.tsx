import { useState } from 'react';
import { Link } from 'react-router';
import type { MapLayerCode, MapLayerValues, SnapshotStatus } from '@shared/contracts/metrics.ts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ActivityMarker } from '@/features/activities/ActivityMarker';
import { formatLayerValue, LAYERS } from './layers';
import { safeDomain } from './palette';
import { SNAPSHOT_STATUS_LABEL } from './snapshot';

export interface MapLegendProps {
  layer: MapLayerCode;
  values: MapLayerValues | null | undefined;
  loading?: boolean;
  status: SnapshotStatus;
  releaseId: string;
  year: number;
  round: number;
  candidateLabel?: string | null;
  activityCount?: number;
  activitiesUnavailable?: boolean;
  activitiesDemo?: boolean;
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
 * (spec §12.3, cartography rules). Colour ramps come from --map-* tokens.
 */
export function MapLegend({
  layer,
  values,
  loading,
  status,
  releaseId,
  year,
  round,
  candidateLabel,
  activityCount,
  activitiesUnavailable,
  activitiesDemo,
  className,
  defaultCollapsed = false,
}: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  const domain = values ? safeDomain(values.domain, diverging) : null;
  const gradient = diverging
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
            {candidateLabel && meta.needsCandidate ? ` · ${candidateLabel}` : ''}
          </p>
          <p className="text-xs text-muted">
            {layer === 'comparison'
              ? '2022 → 2026, 1º turno'
              : layer === 'activities'
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

      {layer === 'activities' ? (
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <p className="flex items-center gap-2">
            <ActivityMarker /> Atividade publicada
            {activitiesDemo ? <Badge variant="demo">Demo</Badge> : null}
          </p>
          <p className="text-xs text-muted">
            {activitiesUnavailable
              ? 'Agenda indisponível no momento.'
              : `${activityCount ?? 0} no mapa · números agrupam atividades próximas.`}
          </p>
        </div>
      ) : (
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
                {diverging ? <span>0</span> : null}
                <span>{formatLayerValue(layer, domain[1])}</span>
              </div>
              <p className="mt-1 flex items-center gap-2 text-xs text-secondary">
                <span
                  className="inline-block size-3 rounded-sm bg-(--map-fill-none)"
                  aria-hidden="true"
                />{' '}
                sem dado
                <span
                  className="inline-block size-3 rounded-full border-2 border-(--map-selected)"
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
                  : 'Camada indisponível para esta seleção no snapshot atual.'}
            </p>
          )}
        </div>
      )}

      {!collapsed ? (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-xs text-secondary">
          <p>
            <span className="font-semibold">Unidade:</span> {meta.unit}
          </p>
          <p>
            <span className="font-semibold">Cálculo:</span> {meta.denominator}
          </p>
          {layer === 'comparison' ? (
            <p>
              Variação não implica transferência de votos. Só candidaturas com histórico em 2022.
            </p>
          ) : null}
          {layer !== 'activities' ? (
            <p>Bairros aparecem como pontos aproximados (sem limites oficiais).</p>
          ) : null}
          <p>
            <span className="font-semibold">Fonte:</span> snapshot{' '}
            <span className="font-mono">{releaseId}</span> ·{' '}
            <Link to="/metodologia" className="underline">
              metodologia
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}
