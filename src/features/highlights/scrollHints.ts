import { useEffect, useState, type RefObject } from 'react';

/**
 * Index of the item whose left edge is nearest to the scroll position (scroll-snap start),
 * clamped to the last item when the scroller reached its end.
 */
export function activeIndexFor(
  scrollLeft: number,
  offsets: number[],
  maxScrollLeft = Infinity,
): number {
  if (!offsets.length) return 0;
  if (scrollLeft >= maxScrollLeft - 2) return offsets.length - 1;
  const base = offsets[0] ?? 0;
  let best = 0;
  offsets.forEach((o, i) => {
    if (Math.abs(o - base - scrollLeft) < Math.abs((offsets[best] ?? 0) - base - scrollLeft))
      best = i;
  });
  return best;
}

export interface ScrollEdges {
  /** Content wider than the box. */
  scrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export function scrollEdgesOf(el: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): ScrollEdges {
  const scrollable = el.scrollWidth > el.clientWidth + 2;
  return {
    scrollable,
    atStart: el.scrollLeft <= 2,
    atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
  };
}

/** Live scroll edges of a horizontal scroller (fade hints on the side with more content). */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({
    scrollable: false,
    atStart: true,
    atEnd: true,
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = scrollEdgesOf(el);
        setEdges((p) =>
          p.scrollable === next.scrollable && p.atStart === next.atStart && p.atEnd === next.atEnd
            ? p
            : next,
        );
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [ref]);
  return edges;
}

/** CSS mask that fades the edge(s) where more content is hidden. */
export function edgeFadeMask({ scrollable, atStart, atEnd }: ScrollEdges): string | undefined {
  if (!scrollable) return undefined;
  const left = atStart ? 'black 0' : 'transparent 0, black 28px';
  const right = atEnd ? 'black 100%' : 'black calc(100% - 28px), transparent 100%';
  return `linear-gradient(to right, ${left}, ${right})`;
}
