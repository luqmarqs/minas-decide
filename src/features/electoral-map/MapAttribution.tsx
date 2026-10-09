import { useId, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

export const MAP_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles Dados © OpenStreetMap contributors';

/** Links get a ≥ 24 px target (WCAG 2.2 2.5.8, P-UX-5). */
const LINK = 'inline-flex min-h-6 items-center underline';

export function MapAttribution({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted', className)}>
      <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className={LINK}>
        © OpenFreeMap
      </a>{' '}
      <a
        href="https://www.openmaptiles.org/"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
      >
        © OpenMapTiles
      </a>{' '}
      Dados{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
      >
        © OpenStreetMap contributors
      </a>{' '}
      · Malha municipal: IBGE
    </p>
  );
}

/**
 * Phone attribution (FE-10), like MapLibre's `compact` control: an ⓘ button over the map
 * that shows the full credits (same links) on demand. Mandatory credits stay one tap away
 * and are always present in the DOM order for screen readers via the button name.
 */
export function MapAttributionCompact({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn('flex flex-row-reverse items-end gap-1', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={
          open
            ? 'Ocultar créditos do mapa'
            : 'Créditos do mapa (OpenFreeMap, OpenMapTiles, OpenStreetMap, IBGE)'
        }
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 shrink-0 place-items-center rounded-pill text-secondary"
      >
        <span className="grid size-7 place-items-center rounded-pill border border-border bg-surface-raised/95 shadow-raised">
          <Icon name="info" size={16} />
        </span>
      </button>
      <div id={id} hidden={!open}>
        <MapAttribution className="max-w-72 rounded-md border border-border bg-surface-raised/95 px-2 py-1 shadow-raised" />
      </div>
    </div>
  );
}
