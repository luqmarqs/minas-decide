import { memo, useMemo, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import type { ProjectedMap } from './geo';
import './story.css';

export type StoryMapSize = 'default' | 'small' | 'fill';

export interface StoryMapProps {
  map: ProjectedMap | null;
  /** CSS colour (usually `var(--token)`) of a municipality; undefined = no data. */
  fillFor?: (id: string) => string | undefined;
  /**
   * One colour for the whole state (the "wall"): drawn as a SINGLE path with every
   * municipality as a sub-path — same picture, 1 element instead of 853.
   */
  uniformFill?: string;
  /** Accessible name of the map image. */
  label: string;
  /** Id of the element holding the textual description (aria-describedby). */
  descId: string;
  /** Extra ids appended to aria-describedby (source line, colour bands note). */
  describedBy?: string[];
  /** Short description rendered under the map (figcaption). */
  caption: ReactNode;
  failed?: boolean;
  legend?: ReactNode;
  /** Small label above the map ("Resumo", "Município a município"). */
  kicker?: ReactNode;
  /** Mute the fill (one opacity on the <svg>, never per path; see story.css). */
  dim?: boolean;
  /** `default` ≤ 42vh (46vh on tablets) · `small` for side-by-side · `fill` for the sticky panel. */
  size?: StoryMapSize;
  className?: string;
}

const SVG_SIZE: Record<StoryMapSize, string> = {
  // FE-10: ≤ 42vh tall on phones (the whole step stays readable on one screen).
  default: 'h-auto max-h-[42vh] w-full md:max-h-[46vh]',
  small: 'h-auto w-full',
  fill: 'h-full min-h-0 w-full',
};
const BOX_SIZE: Record<StoryMapSize, string> = {
  default: 'aspect-[4/3] max-h-[42vh] w-full md:max-h-[46vh]',
  small: 'aspect-[4/3] w-full',
  fill: 'h-full min-h-0 w-full',
};

/**
 * Static SVG map of the 853 municipalities (no WebGL, no interaction). The image is
 * described in text (`aria-describedby`); colour is never the only carrier of the numbers,
 * which are always written in the step text.
 */
export const StoryMap = memo(function StoryMap({
  map,
  fillFor,
  uniformFill,
  label,
  descId,
  describedBy,
  caption,
  failed,
  legend,
  kicker,
  dim,
  size = 'default',
  className,
}: StoryMapProps) {
  const joined = useMemo(
    () => (map && uniformFill ? map.paths.map((p) => p.d).join('') : ''),
    [map, uniformFill],
  );
  const stroke = { stroke: 'var(--color-surface)', strokeWidth: 0.35 } as const;
  return (
    <figure className={cn('flex min-w-0 flex-col gap-2', size === 'fill' && 'h-full', className)}>
      {kicker ? <p className="ed-kicker">{kicker}</p> : null}
      <div className={cn('relative min-w-0', size === 'fill' && 'flex min-h-0 flex-1')}>
        {map ? (
          <svg
            viewBox={`0 0 ${map.width} ${map.height}`}
            role="img"
            aria-label={label}
            aria-describedby={[descId, ...(describedBy ?? [])].join(' ')}
            className={cn(SVG_SIZE[size], dim && 'story-dim')}
            data-testid="story-map"
          >
            {uniformFill ? (
              <path d={joined} style={{ fill: uniformFill, ...stroke }} />
            ) : (
              map.paths.map((p) => (
                <path
                  key={p.id}
                  d={p.d}
                  style={{ fill: fillFor?.(p.id) ?? 'var(--map-fill-none)', ...stroke }}
                />
              ))
            )}
          </svg>
        ) : failed ? (
          <p
            className={cn(
              'grid place-items-center rounded-md bg-surface-alt p-4 text-sm text-secondary',
              BOX_SIZE[size],
            )}
          >
            Contornos municipais indisponíveis; os números estão no texto.
          </p>
        ) : (
          <div role="status" aria-label="Carregando mapa" className={cn(BOX_SIZE[size])}>
            <Skeleton className="mx-auto h-full w-full" />
          </div>
        )}
      </div>
      {legend}
      <figcaption id={descId} className="ed-note">
        {caption}
      </figcaption>
    </figure>
  );
});
