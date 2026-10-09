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
