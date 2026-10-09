import type { Ref } from 'react';
import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { LAYERS } from './layers';
import { MapAttribution } from './MapAttribution';
import { MARGIN_GRADIENT } from './palette';

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
export function MapPlaceholder({
  layer,
  variant = 'full',
  className,
  ref,
}: MapPlaceholderProps & { ref?: Ref<HTMLDivElement> }) {
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  return (
    <div ref={ref} className={cn('flex flex-col', className)} data-testid="map-placeholder">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-alt" role="status">
        <span className="sr-only">Carregando o mapa…</span>
        {variant === 'full' ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 p-2 sm:p-3"
              aria-hidden="true"
            >
              {/* Phones (FE-10): same one-row compact bar as MapControlBar (52 px). */}
              <div className="flex h-13 w-full items-center gap-1 rounded-md border border-border bg-surface-raised/95 p-1 lg:hidden">
                <Skeleton className="h-11 min-w-0 flex-1" />
                <Skeleton className="size-11" />
                <Skeleton className="size-11" />
                <Skeleton className="size-11" />
              </div>
              <div className="hidden w-fit max-w-full gap-2 rounded-md border border-border bg-surface-raised/95 p-2 lg:flex">
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-11 w-40" />
              </div>
            </div>
            <div
              className="pointer-events-none absolute bottom-0 left-0 p-2 lg:hidden"
              aria-hidden="true"
            >
              <div className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-border bg-surface-raised/95 px-3 text-sm text-primary">
                {meta.label}
              </div>
            </div>
            <div
              className="pointer-events-none absolute bottom-0 left-0 hidden w-full p-2 sm:p-3 lg:block lg:w-auto"
              aria-hidden="true"
            >
              <div className="w-full max-w-80 rounded-md border border-border bg-surface-raised/95 p-3 lg:w-80">
                <p className="text-sm font-semibold text-primary">{meta.label}</p>
                <p className="text-xs text-muted">{meta.unit}</p>
                {meta.scale === 'none' ? null : (
                  <div
                    className="mt-2 h-3 rounded-pill opacity-70"
                    style={{
                      backgroundImage:
                        meta.palette === 'partisan'
                          ? MARGIN_GRADIENT
                          : diverging
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
      <MapAttribution className={cn('px-2 py-1', variant === 'full' && 'max-lg:hidden')} />
    </div>
  );
}
