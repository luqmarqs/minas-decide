import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  DESKTOP_QUERY,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
  useMediaQuery,
} from '@/lib/media';

export type StoryMode = 'sticky' | 'static';

/**
 * Scrollytelling only where it helps and is safe: ≥ 1024 px, IntersectionObserver available
 * and motion allowed. Everywhere else every step renders its own static map (the content is
 * complete without any scroll-driven behaviour).
 */
export function useStoryMode(): StoryMode {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const io = typeof IntersectionObserver !== 'undefined';
  return desktop && !reduced && io ? 'sticky' : 'static';
}

/**
 * Active step = the `li[data-step]` crossing a thin band around the middle of the viewport.
 * Only observes in sticky mode; otherwise stays at 1 (unused).
 */
export function useActiveStep(listRef: RefObject<HTMLElement | null>, enabled: boolean): number {
  const [active, setActive] = useState(1);
  useEffect(() => {
    const list = listRef.current;
    if (!enabled || !list || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const n = Number(e.target.getAttribute('data-step'));
          if (n >= 1 && n <= 5) setActive(n);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    list.querySelectorAll('li[data-step]').forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [listRef, enabled]);
  return active;
}

/** Reveal on scroll (IntersectionObserver). Visible from the start when IO is missing
 *  or motion is reduced — content is never hidden behind an animation. */
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(
    () => typeof IntersectionObserver === 'undefined' || prefersReducedMotion(),
  );
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return [ref, shown] as const;
}
