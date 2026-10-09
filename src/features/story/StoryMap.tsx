import { memo, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ProjectedMap } from './geo';

export interface StoryMapProps {
  map: ProjectedMap | null;
  /** CSS colour (usually `var(--token)`) of a municipality; undefined = no data. */
  fillFor: (id: string) => string | undefined;
  /** Accessible name of the map image. */
  label: string;
  /** Id of the element holding the textual description (aria-describedby). */
  descId: string;
  /** Description, source and denominators (rendered under the map). */
  caption: ReactNode;
  failed?: boolean;
  legend?: ReactNode;
}

/**
 * Static SVG map of the 853 municipalities (no WebGL, no interaction). The image is
 * described in text right below it (`aria-describedby`); colour is never the only carrier
 * of the numbers, which are always written in the step text.
 */
export const StoryMap = memo(function StoryMap({
  map,
  fillFor,
  label,
  descId,
  caption,
  failed,
  legend,
}: StoryMapProps) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      {map ? (
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          role="img"
          aria-label={label}
          aria-describedby={descId}
          // FE-10: ≤ 42vh tall on phones (the whole step stays readable on one screen).
          className="h-auto max-h-[42vh] w-full"
          data-testid="story-map"
        >
          {map.paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              style={{
                fill: fillFor(p.id) ?? 'var(--map-fill-none)',
                stroke: 'var(--color-surface)',
                strokeWidth: 0.35,
              }}
            />
          ))}
        </svg>
      ) : failed ? (
        <p className="grid aspect-[4/3] max-h-[42vh] w-full place-items-center rounded-md bg-surface-alt p-4 text-sm text-secondary">
          Contornos municipais indisponíveis; os números estão no texto.
        </p>
      ) : (
        <div role="status" aria-label="Carregando mapa">
          <Skeleton className="mx-auto aspect-[4/3] max-h-[42vh] w-full" />
        </div>
      )}
      {legend}
      <figcaption id={descId} className="text-xs text-secondary">
        {caption}
      </figcaption>
    </figure>
  );
});
