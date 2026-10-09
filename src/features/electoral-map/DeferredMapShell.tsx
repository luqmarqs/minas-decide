import { lazy, Suspense, useRef } from 'react';
import { useAfterIdle, useNearViewport } from '@/lib/idle';
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
 * text content therefore paints without waiting for ~1.5 MB of map JS. FE-10: it also
 * waits until the map section is within one viewport of the screen (the home map sits far
 * below the hero on phones), unless a territory or the list view is already in the URL
 * (deep link) or the person interacted (`start`).
 */
export function DeferredMapShell({ start, ...props }: DeferredMapShellProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const idle = useAfterIdle(start);
  const near = useNearViewport(
    boxRef,
    !!start ||
      !!props.state.territoryId ||
      props.state.view === 'lista' ||
      props.variant === 'context',
  );
  const ready = idle && near;
  const placeholder = (
    <MapPlaceholder
      ref={boxRef}
      layer={props.state.layer}
      variant={props.variant}
      className={props.className}
    />
  );
  if (!ready) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <MapShell {...props} />
    </Suspense>
  );
}
