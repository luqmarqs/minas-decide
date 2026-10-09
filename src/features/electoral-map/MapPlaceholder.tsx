import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { LAYERS } from './layers';
import { MapAttribution } from './MapAttribution';

export interface MapPlaceholderProps {
  layer: MapLayerCode;
  variant?: 'full' | 'context';
  className?: string;
}

/**
 * Lightweight stand-in shown until the map is started after `load` + idle
 * (P-PERF-1). Same box model as `MapShell` (flex column, map area + attribution)
 * so swapping it never shifts the page (CLS). Surface colour + skeleton only — no
 * mesh, no tiles, no WebGL.
 */
export function MapPlaceholder({ layer, variant = 'full', className }: MapPlaceholderProps) {
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  return (
    <div className={cn('flex flex-col', className)} data-testid="map-placeholder">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-alt" role="status">
        <span className="sr-only">Carregando o mapa…</span>
        {variant === 'full' ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 p-2 sm:p-3"
              aria-hidden="true"
            >
              <div className="flex w-fit max-w-full gap-2 rounded-md border border-border bg-surface-raised/95 p-2">
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-11 w-28" />
                <Skeleton className="hidden h-11 w-40 sm:block" />
              </div>
            </div>
            <div
              className="pointer-events-none absolute bottom-0 left-0 w-full p-2 sm:p-3 lg:w-auto"
              aria-hidden="true"
            >
              <div className="w-full max-w-80 rounded-md border border-border bg-surface-raised/95 p-3 lg:w-80">
                <p className="text-sm font-semibold text-primary">{meta.label}</p>
                <p className="text-xs text-muted">{meta.unit}</p>
                {meta.scale === 'none' ? null : (
                  <div
                    className="mt-2 h-3 rounded-pill opacity-70"
                    style={{
                      backgroundImage: diverging
                        ? 'linear-gradient(to right, var(--map-diverging-neg), var(--map-diverging-zero), var(--map-diverging-pos))'
                        : 'linear-gradient(to right, var(--map-fill-low), var(--map-fill-mid-low), var(--map-fill-mid), var(--map-fill-mid-high), var(--map-fill-high))',
                    }}
                  />
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
      <MapAttribution className="px-2 py-1" />
    </div>
  );
}
