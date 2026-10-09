import { lazy, Suspense } from 'react';
import { useAfterIdle } from '@/lib/idle';
import { MapPlaceholder } from './MapPlaceholder';
import type { MapShellProps } from './MapShell';

const MapShell = lazy(() => import('./MapShell').then((m) => ({ default: m.MapShell })));

export interface DeferredMapShellProps extends MapShellProps {
  /** Start right away (e.g. the person already interacted with the search). */
  start?: boolean;
}

/**
 * Renders a static placeholder first and only imports/starts the map (MapLibre,
 * territories index, layer data) after `load` + idle (P-PERF-1). The page's
 * text content therefore paints without waiting for ~1.5 MB of map JS.
 */
export function DeferredMapShell({ start, ...props }: DeferredMapShellProps) {
  const ready = useAfterIdle(start);
  const placeholder = (
    <MapPlaceholder layer={props.state.layer} variant={props.variant} className={props.className} />
  );
  if (!ready) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <MapShell {...props} />
    </Suspense>
  );
}
